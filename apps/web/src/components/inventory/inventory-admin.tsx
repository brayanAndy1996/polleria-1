'use client';

import { Button } from '@heroui/react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Dialog, Modal, ModalOverlay } from 'react-aria-components';
import type {
  InventoryAdjustmentRequest,
  InventoryControlRequest,
  InventoryMutationResponse,
} from '@polleria/shared';
import { apiErrorMessage } from '../../lib/api/error-message.ts';
import { ApiError } from '../../lib/api/client.ts';
import {
  addChickenBatch,
  addDrinkReceipt,
  adjustInventory,
  getInventory,
  listInventoryMovements,
  setChickenControl,
  setDrinkControl,
} from '../../lib/api/inventory.ts';
import type { InventorySnapshot } from '@polleria/shared';

const INVENTORY_KEY = ['admin', 'inventory'] as const;
const MOVEMENTS_KEY = ['admin', 'inventory', 'movements'] as const;

type Operation = 'batch' | 'receipt' | 'adjustment' | 'chicken-control' | 'drink-control';
type Attempt = {
  operation: Operation;
  key: string;
  body: unknown;
  productId?: number;
};

function createKey() {
  return crypto.randomUUID();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Lima',
  }).format(new Date(value));
}

function formatBalance(snapshot: InventorySnapshot | undefined) {
  if (!snapshot) return 'Cargando saldo…';
  return `Pecho ${snapshot.chicken.breastEighths} octavos · Pierna ${snapshot.chicken.legEighths} octavos`;
}

function movementLabel(movement: {
  kind: string;
  productName: string | null;
  delta: number;
  quantityAfter: number;
}) {
  const resource =
    movement.kind === 'drink'
      ? (movement.productName ?? 'Bebida')
      : movement.kind === 'breast'
        ? 'Pecho'
        : 'Pierna';
  const unit = movement.kind === 'drink' ? 'unidades' : 'octavos';
  const sign = movement.delta > 0 ? '+' : '';
  return `${resource} · ${sign}${movement.delta} ${unit} · saldo ${movement.quantityAfter}`;
}

export function InventoryAdmin() {
  const queryClient = useQueryClient();
  const inventory = useQuery({
    queryKey: INVENTORY_KEY,
    queryFn: getInventory,
    retry: false,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });
  const history = useInfiniteQuery({
    queryKey: MOVEMENTS_KEY,
    queryFn: ({ pageParam }) => listInventoryMovements(pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.nextAfterId ?? undefined,
    retry: false,
  });
  const [activeForm, setActiveForm] = useState<Operation | null>(null);
  const [draft, setDraft] = useState({
    chickens: '',
    quantity: '',
    kind: 'breast' as InventoryAdjustmentRequest['kind'],
    productId: '',
    delta: '',
    reason: '',
    controlEnabled: false,
  });
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [review, setReview] = useState(false);
  const [formError, setFormError] = useState<string>();

  const mutation = useMutation({
    mutationFn: (next: Attempt): Promise<InventoryMutationResponse> => {
      if (next.operation === 'batch')
        return addChickenBatch(next.body as { chickens: number; reason: string }, next.key);
      if (next.operation === 'receipt')
        return addDrinkReceipt(
          next.productId!,
          next.body as { quantity: number; reason: string },
          next.key,
        );
      if (next.operation === 'adjustment')
        return adjustInventory(next.body as InventoryAdjustmentRequest, next.key);
      if (next.operation === 'chicken-control')
        return setChickenControl(next.body as InventoryControlRequest, next.key);
      return setDrinkControl(next.productId!, next.body as InventoryControlRequest, next.key);
    },
    onSuccess: (result) => {
      queryClient.setQueryData(INVENTORY_KEY, result.inventory);
      void queryClient.invalidateQueries({ queryKey: MOVEMENTS_KEY });
      setAttempt(null);
      setUncertain(false);
      setReview(false);
      setFormError(undefined);
      setDraft({
        chickens: '',
        quantity: '',
        kind: 'breast',
        productId: '',
        delta: '',
        reason: '',
        controlEnabled: false,
      });
    },
    onError: (error) => {
      const status = error instanceof ApiError ? error.status : 0;
      const isUncertain =
        status === 0 ||
        status >= 500 ||
        (error instanceof ApiError &&
          error.code === 'UNEXPECTED_RESPONSE' &&
          (status === 200 || status === 201));
      setUncertain(isUncertain);
      if (!isUncertain) setAttempt(null);
      setFormError(apiErrorMessage(error));
      if (!isUncertain) void inventory.refetch();
    },
  });

  const openForm = (operation: Operation) => {
    setActiveForm(operation);
    setAttempt(null);
    setUncertain(false);
    setFormError(undefined);
  };

  const makeAttempt = (operation: Operation, body: unknown, productId?: number) => {
    if (uncertain || mutation.isPending) return;
    setAttempt({ operation, body, productId, key: createKey() });
    setReview(true);
  };

  const confirm = () => {
    if (attempt === null || mutation.isPending) return;
    if (attempt.operation.includes('control')) {
      const reason = (attempt.body as InventoryControlRequest).reason.trim();
      if (reason.length < 1 || reason.length > 200) {
        setFormError('El motivo debe tener entre 1 y 200 caracteres.');
        return;
      }
    }
    mutation.mutate(attempt);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (activeForm === 'batch') {
      const chickens = Number(draft.chickens);
      if (
        !Number.isInteger(chickens) ||
        chickens < 1 ||
        chickens > 10000 ||
        draft.reason.trim() === ''
      ) {
        setFormError('Indica entre 1 y 10 000 pollos y escribe un motivo.');
        return;
      }
      makeAttempt('batch', { chickens, reason: draft.reason.trim() });
    } else if (activeForm === 'receipt') {
      const quantity = Number(draft.quantity);
      const productId = Number(draft.productId);
      if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 100000 ||
        !Number.isInteger(productId) ||
        draft.reason.trim() === ''
      ) {
        setFormError('Indica unidades válidas, una bebida y un motivo.');
        return;
      }
      makeAttempt('receipt', { quantity, reason: draft.reason.trim() }, productId);
    } else if (activeForm === 'adjustment') {
      const delta = Number(draft.delta);
      const productId = draft.kind === 'drink' ? Number(draft.productId) : null;
      if (
        !Number.isInteger(delta) ||
        delta === 0 ||
        Math.abs(delta) > 100000 ||
        (draft.kind === 'drink' && !Number.isInteger(productId)) ||
        draft.reason.trim() === ''
      ) {
        setFormError('Indica un ajuste entero distinto de cero y escribe un motivo.');
        return;
      }
      makeAttempt('adjustment', {
        kind: draft.kind,
        productId,
        delta,
        reason: draft.reason.trim(),
      });
    } else {
      setFormError('Elige una acción de inventario.');
    }
  };

  const snapshot = inventory.data;
  const busy = mutation.isPending || uncertain;
  const drinks = snapshot?.drinks ?? [];

  return (
    <main className="inventory-admin space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Inventario</h1>
        <p className="text-sm text-muted">
          {snapshot ? `Actualizado ${formatDate(snapshot.generatedAt)}` : 'Saldo no disponible'}
        </p>
        <a href="/admin" className="text-accent underline underline-offset-4">
          Volver a Administración
        </a>
        <p className="text-sm text-muted">El saldo se conserva al cambiar de día.</p>
        {inventory.isError && (
          <p role="alert">
            No se pudo cargar el inventario.{' '}
            <button type="button" onClick={() => void inventory.refetch()}>
              Reintentar
            </button>
          </p>
        )}
      </header>

      <section className="grid gap-4 lg:grid-cols-2" aria-label="Saldos de inventario">
        <article className="rounded-2xl border border-separator bg-surface p-5 space-y-3">
          <h2 className="text-xl font-bold">Pollo</h2>
          <p className="tabular-nums">{formatBalance(snapshot)}</p>
          <p>{snapshot?.chicken.enabled ? 'Control de stock activo' : 'Sin control de stock'}</p>
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-12" isDisabled={busy} onPress={() => openForm('batch')}>
              Registrar tanda
            </Button>
            <Button
              className="min-h-12"
              variant="secondary"
              isDisabled={busy || snapshot === undefined}
              onPress={() => {
                setActiveForm(null);
                setFormError(undefined);
                if (snapshot) {
                  makeAttempt('chicken-control', {
                    enabled: !snapshot.chicken.enabled,
                    reason: '',
                  });
                }
              }}
            >
              {snapshot?.chicken.enabled ? 'Desactivar control' : 'Activar control'}
            </Button>
          </div>
          {activeForm === 'batch' && (
            <form className="space-y-3" onSubmit={submit}>
              <label className="block">
                Pollos enteros
                <input
                  className="inventory-field block w-full"
                  type="number"
                  min="1"
                  max="10000"
                  step="1"
                  value={draft.chickens}
                  disabled={busy || !snapshot?.chicken.enabled}
                  onChange={(event) => setDraft({ ...draft, chickens: event.target.value })}
                />
              </label>
              <p className="text-sm text-muted">
                Cada pollo agrega 4 octavos de pecho y 4 de pierna.
              </p>
              <label className="block">
                Motivo
                <input
                  className="inventory-field block w-full"
                  value={draft.reason}
                  disabled={busy || !snapshot?.chicken.enabled}
                  onChange={(event) => setDraft({ ...draft, reason: event.target.value })}
                />
              </label>
              {!snapshot?.chicken.enabled && <p>Activa el control para registrar existencias.</p>}
              <Button
                type="submit"
                className="min-h-12"
                isDisabled={busy || !snapshot?.chicken.enabled}
              >
                Revisar tanda
              </Button>
            </form>
          )}
        </article>

        <article className="rounded-2xl border border-separator bg-surface p-5 space-y-3">
          <h2 className="text-xl font-bold">Bebidas</h2>
          {drinks.length === 0 ? (
            <p>No hay bebidas en la carta.</p>
          ) : (
            <ul className="space-y-3">
              {drinks.map((drink) => (
                <li
                  key={drink.productId}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-separator py-2"
                >
                  <div className="min-w-0">
                    <strong className="wrap-anywhere">{drink.productName}</strong>
                    <p>{drink.enabled ? `${drink.quantity} unidades` : 'Sin control de stock'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      className="min-h-12"
                      isDisabled={busy}
                      onPress={() => {
                        setDraft({ ...draft, productId: String(drink.productId) });
                        openForm('receipt');
                      }}
                    >
                      Registrar entrada
                    </Button>
                    <Button
                      className="min-h-12"
                      variant="secondary"
                      isDisabled={busy || !drink.enabled}
                      onPress={() => {
                        setDraft({ ...draft, productId: String(drink.productId) });
                        setActiveForm(null);
                        setFormError(undefined);
                        makeAttempt(
                          'drink-control',
                          { enabled: false, reason: '' },
                          drink.productId,
                        );
                      }}
                    >
                      Desactivar
                    </Button>
                    <Button
                      className="min-h-12"
                      variant="secondary"
                      isDisabled={busy || drink.enabled}
                      onPress={() => {
                        setDraft({ ...draft, productId: String(drink.productId) });
                        setActiveForm(null);
                        setFormError(undefined);
                        makeAttempt(
                          'drink-control',
                          { enabled: true, reason: '' },
                          drink.productId,
                        );
                      }}
                    >
                      Activar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {activeForm === 'receipt' && (
            <form className="space-y-3" onSubmit={submit}>
              <label className="block">
                Bebida
                <select
                  className="inventory-field block w-full"
                  value={draft.productId}
                  disabled={busy}
                  onChange={(event) => setDraft({ ...draft, productId: event.target.value })}
                >
                  <option value="">Elige una bebida</option>
                  {drinks.map((drink) => (
                    <option key={drink.productId} value={drink.productId}>
                      {drink.productName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                Unidades
                <input
                  className="inventory-field block w-full"
                  type="number"
                  min="1"
                  max="100000"
                  step="1"
                  value={draft.quantity}
                  disabled={busy}
                  onChange={(event) => setDraft({ ...draft, quantity: event.target.value })}
                />
              </label>
              <label className="block">
                Motivo
                <input
                  className="inventory-field block w-full"
                  value={draft.reason}
                  disabled={busy}
                  onChange={(event) => setDraft({ ...draft, reason: event.target.value })}
                />
              </label>
              <Button type="submit" className="min-h-12" isDisabled={busy}>
                Revisar entrada
              </Button>
            </form>
          )}
        </article>
      </section>

      <section className="rounded-2xl border border-separator bg-surface p-5 space-y-4">
        <h2 className="text-xl font-bold">Ajuste manual</h2>
        {activeForm !== 'adjustment' && (
          <Button className="min-h-12" isDisabled={busy} onPress={() => openForm('adjustment')}>
            Ajustar inventario
          </Button>
        )}
        {activeForm === 'adjustment' && (
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
            <label>
              Recurso
              <select
                className="inventory-field block w-full"
                value={draft.kind}
                disabled={busy}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    kind: event.target.value as InventoryAdjustmentRequest['kind'],
                  })
                }
              >
                <option value="breast">Pecho (octavos)</option>
                <option value="leg">Pierna (octavos)</option>
                <option value="drink">Bebida (unidades)</option>
              </select>
            </label>
            {draft.kind === 'drink' && (
              <label>
                Bebida
                <select
                  className="block w-full"
                  value={draft.productId}
                  disabled={busy}
                  onChange={(event) => setDraft({ ...draft, productId: event.target.value })}
                >
                  <option value="">Elige una bebida</option>
                  {drinks
                    .filter((drink) => drink.enabled)
                    .map((drink) => (
                      <option key={drink.productId} value={drink.productId}>
                        {drink.productName}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label>
              Cambio (+ agrega, − retira)
              <input
                className="inventory-field block w-full"
                type="number"
                step="1"
                value={draft.delta}
                disabled={busy}
                onChange={(event) => setDraft({ ...draft, delta: event.target.value })}
              />
            </label>
            <label>
              Motivo
              <input
                className="inventory-field block w-full"
                value={draft.reason}
                disabled={busy}
                onChange={(event) => setDraft({ ...draft, reason: event.target.value })}
              />
            </label>
            <div>
              <Button type="submit" className="min-h-12" isDisabled={busy}>
                Revisar ajuste
              </Button>
            </div>
          </form>
        )}
      </section>

      <section
        className="rounded-2xl border border-separator bg-surface p-5 space-y-4"
        aria-labelledby="inventory-history-heading"
      >
        <h2 id="inventory-history-heading" className="text-xl font-bold">
          Movimientos
        </h2>
        {history.isError && (
          <div role="alert">
            <p>No se pudieron cargar los movimientos.</p>
            <Button className="min-h-12" onPress={() => void history.refetch()}>
              Reintentar historial
            </Button>
          </div>
        )}
        {(history.data?.pages.flatMap((page) => page.movements) ?? []).length === 0 &&
          !history.isPending &&
          !history.isError && <p>Sin movimientos. Registra la primera entrada para comenzar.</p>}
        <ol className="space-y-3">
          {history.data?.pages
            .flatMap((page) => page.movements)
            .map((movement) => (
              <li key={movement.id} className="min-w-0 border-b border-separator py-3">
                <p className="font-medium">{movementLabel(movement)}</p>
                <p className="wrap-anywhere">
                  <span>{movement.reason}</span> · {movement.actor.displayName} ·{' '}
                  {formatDate(movement.createdAt)}
                </p>
              </li>
            ))}
        </ol>
        {history.hasNextPage && (
          <Button
            className="min-h-12"
            isDisabled={history.isFetchingNextPage}
            onPress={() => void history.fetchNextPage()}
          >
            {history.isFetchingNextPage ? 'Cargando…' : 'Cargar siguientes'}
          </Button>
        )}
      </section>

      {formError && (
        <p role="alert" className="text-danger">
          {formError}
        </p>
      )}
      <ModalOverlay
        isOpen={review && attempt !== null}
        isDismissable={!mutation.isPending && !uncertain}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending && !uncertain) setReview(false);
        }}
        className="payment-overlay print-hidden"
      >
        <Modal className="payment-modal">
          <Dialog className="inventory-review" aria-labelledby="inventory-review-title">
            {review && attempt && (
              <>
                <h2 id="inventory-review-title" className="text-xl font-bold">
                  Revisar movimiento
                </h2>
                <p>
                  {attempt.operation === 'batch'
                    ? `Registrar ${String((attempt.body as { chickens: number }).chickens)} pollos: ${formatBalance(snapshot)} → +4 octavos por parte y pollo.`
                    : attempt.operation === 'receipt'
                      ? `Registrar ${String((attempt.body as { quantity: number }).quantity)} unidades de bebida.`
                      : attempt.operation === 'adjustment'
                        ? `Aplicar ajuste de ${String((attempt.body as InventoryAdjustmentRequest).delta)}.`
                        : 'Cambiar el control de stock; el saldo e historial se conservan.'}
                </p>
                {attempt.operation.includes('control') && (
                  <p>
                    El saldo y el historial se conservan. Desactivar detiene la comprobación de
                    existencias.
                  </p>
                )}
                {attempt.operation.includes('control') && (
                  <label className="mt-3 block">
                    Motivo
                    <input
                      className="inventory-field block w-full"
                      value={String((attempt.body as InventoryControlRequest).reason)}
                      maxLength={200}
                      disabled={uncertain || mutation.isPending}
                      onChange={(event) =>
                        setAttempt({
                          ...attempt,
                          body: {
                            ...(attempt.body as InventoryControlRequest),
                            reason: event.target.value,
                          },
                        })
                      }
                    />
                  </label>
                )}
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button
                    className="min-h-12"
                    isDisabled={
                      mutation.isPending ||
                      (attempt.operation.includes('control') &&
                        ((attempt.body as InventoryControlRequest).reason.trim() === '' ||
                          (attempt.body as InventoryControlRequest).reason.trim().length > 200))
                    }
                    onPress={confirm}
                  >
                    {mutation.isPending
                      ? 'Registrando…'
                      : attempt.operation === 'batch'
                        ? 'Confirmar tanda'
                        : 'Confirmar movimiento'}
                  </Button>
                  {uncertain ? (
                    <Button
                      className="min-h-12"
                      variant="secondary"
                      isDisabled={mutation.isPending}
                      onPress={confirm}
                    >
                      Reintentar
                    </Button>
                  ) : (
                    <Button
                      className="min-h-12"
                      variant="secondary"
                      onPress={() => setReview(false)}
                    >
                      Cancelar
                    </Button>
                  )}
                </div>
              </>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </main>
  );
}
