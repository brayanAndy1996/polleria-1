'use client';

import { Button, Input } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelOrderRequestSchema,
  formatSoles,
  toLimaDateTimeParts,
  voidOrderItemRequestSchema,
} from '@polleria/shared';
import type { KitchenTicket, Order, OrderItem, Table, TableRef, UserRef } from '@polleria/shared';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { RoleGuard, useSessionQuery } from '../../../../components/auth/role-guard.tsx';
import { ApiError } from '../../../../lib/api/client.ts';
import { apiErrorMessage } from '../../../../lib/api/error-message.ts';
import { issuesFromZod } from '../../../../lib/api/issues.ts';
import { joinTable, leaveTable, openTableOrder, getTables } from '../../../../lib/api/tables.ts';
import {
  cancelOrder,
  getOrder,
  getOrderTickets,
  markReady,
  markServed,
  moveOrder,
  requestBill,
} from '../../../../lib/api/orders.ts';
import { rejectVoidItem, requestVoidItem, voidOrderItem } from '../../../../lib/api/order-items.ts';
import { createIdempotencyKey } from '../../../../lib/idempotency.ts';
import { OrderTicketPrints } from '../../../../components/kitchen-ticket-prints/kitchen-ticket-print-sections.tsx';
import {
  KITCHEN_TICKET_KIND_LABELS,
  TABLE_STATE_LABELS,
  formatPortionCutLabel,
} from '../../../../lib/menu-labels.ts';

const NOTICE_KEY = 'polleria:orderNotice';

function tablesQueryKey() {
  return ['waiter', 'tables'] as const;
}
/** Detalle de la mesa en una sola consulta encadenada (D-011-05, D-011-03). */
interface MesaDetail {
  table: Table | null;
  order: Order | null;
  tickets: KitchenTicket[];
}
function detailQueryKey(tableId: number) {
  return ['waiter', 'mesa', tableId] as const;
}

/** Marca derivada del pedido (misma precedencia que la API: listo antes que cuenta). */
function orderStateLabel(order: Order): string {
  if (order.readyAt !== null) return TABLE_STATE_LABELS.ready;
  if (order.billRequestedAt !== null) return TABLE_STATE_LABELS.bill_requested;
  return TABLE_STATE_LABELS.occupied;
}

/**
 * Fila de ítem (D-011-06): línea 'N × Nombre — Presentación — parte · S/ X.XX',
 * cremas, observación, componentes del combo, traza de mesa unida, marcas del
 * ciclo de anulación y las acciones según rol y estado.
 *
 * El nombre del producto sin presentación va en su propio <span> para quedar
 * como texto exacto del elemento ('Inca Kola' lleva su line-through); con
 * presentación la línea completa queda en el texto directo del <p>.
 */
function OrderItemRow({
  item,
  tableId,
  isAdmin,
  onRequestVoid,
  onVoid,
  onApproveVoid,
  onRejectVoid,
}: {
  item: OrderItem;
  tableId: number;
  isAdmin: boolean;
  onRequestVoid: (item: OrderItem) => void;
  onVoid: (item: OrderItem) => void;
  onApproveVoid: (item: OrderItem) => void;
  onRejectVoid: (item: OrderItem) => void;
}) {
  const portionLabel =
    item.portion !== null ? ` — ${formatPortionCutLabel(item.portion, item.cut)}` : '';
  const voided = item.status === 'voided';
  const bareText = item.portion !== null;
  return (
    <li className="space-y-1 rounded-2xl border border-separator bg-surface px-4 py-3">
      <p className={voided ? 'text-muted line-through' : ''}>
        {item.quantity} ×{' '}
        {bareText ? (
          <>
            {item.productName}
            {portionLabel}
          </>
        ) : (
          <span className={voided ? 'line-through' : ''}>{item.productName}</span>
        )}{' '}
        · {formatSoles(item.quantity * item.priceCents)}
      </p>
      {item.sauces.map((sauce) => (
        <p key={sauce.productId} className="text-sm text-muted">
          + {sauce.productName}
          {sauce.quantity > 1 ? ` × ${sauce.quantity}` : ''}
          {sauce.priceCents > 0 ? ` · ${formatSoles(sauce.quantity * sauce.priceCents)}` : ''}
        </p>
      ))}
      {item.notes !== null && <p className="text-sm text-muted">{item.notes}</p>}
      {item.components.length > 0 && (
        <ul className="ml-4 space-y-1">
          {item.components.map((component) => (
            <li key={component.productId} className="text-sm text-muted">
              {component.quantity} × {component.productName}
              {component.portion !== null
                ? ` — ${formatPortionCutLabel(component.portion, component.cut)}`
                : ''}
            </li>
          ))}
        </ul>
      )}
      {item.orderedAtTable !== null && item.orderedAtTable.id !== tableId && (
        <p className="text-sm text-muted">· {item.orderedAtTable.name}</p>
      )}
      {item.status === 'void_requested' && (
        <div className="space-y-1">
          <p className="text-sm font-semibold">Anulación pedida</p>
          {item.voidRequestedBy !== null && (
            <p className="text-sm text-muted">
              pidió {item.voidRequestedBy.displayName}
              {item.voidRequestReason !== null ? `: ${item.voidRequestReason}` : ''}
            </p>
          )}
        </div>
      )}
      {voided && (
        <div className="space-y-1">
          <p className="text-sm font-semibold">Anulado</p>
          <p className="text-sm text-muted">
            {item.voidReason}
            {item.voidedBy !== null ? ` · ${item.voidedBy.displayName}` : ''}
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        {item.status === 'sent' && (
          <Button className="min-h-12" onPress={() => onRequestVoid(item)}>
            Solicitar anulación
          </Button>
        )}
        {isAdmin && item.status === 'sent' && (
          <Button className="min-h-12" onPress={() => onVoid(item)}>
            Anular
          </Button>
        )}
        {isAdmin && item.status === 'void_requested' && (
          <>
            <Button className="min-h-12" onPress={() => onApproveVoid(item)}>
              Aprobar anulación
            </Button>
            <Button className="min-h-12" onPress={() => onRejectVoid(item)}>
              Rechazar solicitud
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

/** Línea de una comanda: etiqueta del tipo + hora de emisión + sus ítems. */
function TicketBlock({ ticket }: { ticket: KitchenTicket }) {
  const time = toLimaDateTimeParts(new Date(ticket.createdAt));
  return (
    <li className="rounded-2xl border border-separator bg-surface px-4 py-3">
      {/* Los ítems van plegados tras la etiqueta y la hora ('resumidos', D-011-06):
          el mozo expande la comanda para ver el detalle. */}
      <details className="space-y-1">
        <summary className="flex cursor-pointer items-center justify-between gap-2">
          <span className="font-semibold">{KITCHEN_TICKET_KIND_LABELS[ticket.kind]}</span>
          <span className="text-sm text-muted">{`${time.hour}:${time.minute}`}</span>
        </summary>
        <ul className="space-y-1 pt-2">
          {/* La comanda resume TODOS sus ítems, incluidas las bebidas (ADV-011-04). */}
          {ticket.items.map((item) => (
            <li key={item.id} className="text-sm">
              {item.productName} × {item.quantity}
              {item.portion !== null ? ` — ${formatPortionCutLabel(item.portion, item.cut)}` : ''}
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

type Panel =
  | { kind: 'move' }
  | { kind: 'join' }
  | { kind: 'separate'; table: TableRef }
  | { kind: 'cancel' }
  | { kind: 'void'; item: OrderItem; mode: 'request' | 'approve' | 'direct'; key: string }
  | { kind: 'reject'; item: OrderItem; key: string };

/** La mesa libre: nombre, estado y 'Abrir mesa' con envío único. */
function FreeTable({
  table,
  error,
  onErrorChange,
}: {
  table: Table;
  error: string | undefined;
  onErrorChange: (message: string | undefined) => void;
}) {
  const queryClient = useQueryClient();
  const sending = useRef(false);
  const open = useMutation({
    mutationFn: () => openTableOrder(table.id),
    onSuccess: (order) => {
      onErrorChange(undefined);
      flushSync(() => {
        queryClient.setQueryData<MesaDetail>(detailQueryKey(table.id), (prev) =>
          prev === undefined ? { table, order, tickets: [] } : { ...prev, order },
        );
      });
      void queryClient.invalidateQueries({ queryKey: tablesQueryKey() });
    },
    onError: (mutationError) => {
      onErrorChange(apiErrorMessage(mutationError));
      // El 409 suele significar que la mesa ya se ocupó: el salón y el detalle
      // se releen para que la pantalla refleje el estado real de inmediato.
      void queryClient.invalidateQueries({ queryKey: tablesQueryKey() });
      void queryClient.invalidateQueries({ queryKey: detailQueryKey(table.id) });
    },
    onSettled: () => {
      sending.current = false;
    },
  });
  return (
    <>
      <h1 className="text-3xl font-bold">{table.name}</h1>
      <p>{TABLE_STATE_LABELS.free}</p>
      {error !== undefined && <p role="alert">{error}</p>}
      <Button
        className="min-h-12"
        isDisabled={open.isPending}
        onPress={() => {
          if (sending.current) return;
          sending.current = true;
          open.mutate();
        }}
      >
        {open.isPending ? 'Abriendo...' : 'Abrir mesa'}
      </Button>
      <p>
        <Link href="/mozo" className="text-accent underline underline-offset-4">
          Volver a las mesas
        </Link>
      </p>
    </>
  );
}

/** Diálogo de motivo compartido por Solicitar/Anular/Aprobar anulación y Cancelar pedido. */
function ReasonDialog({
  label,
  value,
  pending,
  localError,
  onValue,
  onAccept,
  onCancel,
}: {
  label: string;
  value: string;
  pending: boolean;
  localError: string | undefined;
  onValue: (value: string) => void;
  onAccept: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4 rounded-2xl border border-separator bg-surface px-4 py-4">
      {/* El motivo va con aria-label: la etiqueta visible chocaría con el texto del aviso local. */}
      <Input
        aria-label={label}
        value={value}
        fullWidth
        onChange={(event) => onValue(event.target.value)}
      />
      {localError !== undefined && <p role="alert">{localError}</p>}
      <div className="flex flex-wrap gap-3">
        <Button className="min-h-12" isDisabled={pending} onPress={onAccept}>
          Aceptar
        </Button>
        <Button className="min-h-12" onPress={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

/** La mesa ocupada: acciones del ciclo, ítems con sus marcas y comandas. */
function OccupiedTable({
  table,
  orderId,
  salon,
  current,
  tickets,
  openError,
}: {
  table: Table;
  orderId: number;
  salon: readonly Table[];
  current: Order;
  tickets: readonly KitchenTicket[];
  openError: string | undefined;
}) {
  const session = useSessionQuery();
  const isAdmin = session.data?.user.roles.includes('admin') ?? false;
  const canManagePrints =
    session.data?.user.roles.some((role) => role === 'waiter' || role === 'admin') ?? false;
  const sessionUser: UserRef | undefined =
    session.data === undefined
      ? undefined
      : { id: session.data.user.id, displayName: session.data.user.displayName };
  const queryClient = useQueryClient();
  const router = useRouter();
  const [notice] = useState<string | null>(() => {
    try {
      const value = sessionStorage.getItem(NOTICE_KEY);
      if (value !== null) sessionStorage.removeItem(NOTICE_KEY);
      return value;
    } catch {
      return null;
    }
  });
  const [panel, setPanel] = useState<Panel | null>(null);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState<string>();
  const [localError, setLocalError] = useState<string>();
  const [moveTarget, setMoveTarget] = useState('');
  const [joinTarget, setJoinTarget] = useState('');
  const sending = useRef(false);

  const closePanel = () => {
    setPanel(null);
    setReason('');
    setLocalError(undefined);
  };
  const afterOrder = (next: Order) => {
    flushSync(() => {
      queryClient.setQueryData<MesaDetail>(detailQueryKey(table.id), (prev) =>
        prev === undefined ? { table, order: next, tickets: [] } : { ...prev, order: next },
      );
    });
    void queryClient.invalidateQueries({ queryKey: tablesQueryKey() });
  };
  const run = (mutation: { isPending: boolean; mutate: () => void }) => {
    if (sending.current) return;
    sending.current = true;
    setActionError(undefined);
    mutation.mutate();
  };
  const mutationOptions = {
    onError: (mutationError: Error) => {
      setActionError(apiErrorMessage(mutationError));
    },
    onSettled: () => {
      sending.current = false;
    },
  };

  const signal = useMutation({
    mutationFn: (action: 'ready' | 'served' | 'request-bill') =>
      action === 'ready'
        ? markReady(orderId)
        : action === 'served'
          ? markServed(orderId)
          : requestBill(orderId),
    onSuccess: (next) => {
      afterOrder(next);
      setActionError(undefined);
    },
    ...mutationOptions,
  });
  const move = useMutation({
    mutationFn: (targetId: number) => moveOrder(orderId, targetId),
    onSuccess: (next, targetId) => {
      afterOrder(next);
      closePanel();
      // Se navega al destino enviado en la mutación, no al del estado (puede
      // haber cambiado en vuelo).
      router.push(`/mozo/mesas/${targetId}`);
    },
    ...mutationOptions,
  });
  const join = useMutation({
    mutationFn: (sourceId: number) => joinTable(sourceId, table.id),
    onSuccess: (next) => {
      afterOrder(next);
      closePanel();
    },
    ...mutationOptions,
  });
  const leave = useMutation({
    mutationFn: (tableId: number) => leaveTable(tableId),
    onSuccess: (next) => {
      afterOrder(next);
      closePanel();
    },
    ...mutationOptions,
  });
  const cancel = useMutation({
    mutationFn: (value: string) => cancelOrder(orderId, value),
    onSuccess: () => {
      router.push('/mozo');
    },
    ...mutationOptions,
  });
  const voidCycle = useMutation({
    mutationFn: async (input: {
      mode: 'request' | 'approve' | 'direct' | 'reject';
      item: OrderItem;
      reason: string;
      // La clave nace al abrir el panel (un intento); el reintento la reusa
      // (regla 5/6 aplicada al ciclo de anulación — ADV-011-01).
      key: string;
    }) => {
      const key = input.key;
      if (input.mode === 'request')
        return requestVoidItem(orderId, input.item.id, key, input.reason);
      if (input.mode === 'reject') return rejectVoidItem(orderId, input.item.id, key);
      return voidOrderItem(orderId, input.item.id, key, input.reason);
    },
    onMutate: (input) => {
      // Marca optimista del ítem (regla 6): la fila refleja la decisión en el
      // acto; el servidor confirma con el pedido completo o se revierte.
      const previous = queryClient.getQueryData<MesaDetail>(detailQueryKey(table.id));
      if (previous?.order !== null && previous?.order !== undefined) {
        const optimistic: OrderItem =
          input.mode === 'request'
            ? {
                ...input.item,
                status: 'void_requested',
                voidRequestedBy: sessionUser ?? null,
                voidRequestedAt: new Date().toISOString(),
                voidRequestReason: input.reason,
              }
            : input.mode === 'reject'
              ? {
                  ...input.item,
                  status: 'sent',
                  voidRequestedBy: null,
                  voidRequestedAt: null,
                  voidRequestReason: null,
                }
              : {
                  ...input.item,
                  status: 'voided',
                  voidedBy: sessionUser ?? null,
                  voidedAt: new Date().toISOString(),
                  voidReason: input.reason,
                };
        const order: Order = {
          ...previous.order,
          items: previous.order.items.map((item) =>
            item.id === input.item.id ? optimistic : item,
          ),
        };
        queryClient.setQueryData<MesaDetail>(detailQueryKey(table.id), {
          ...previous,
          order,
        });
      }
      return { previous };
    },
    onError: (mutationError, _input, context) => {
      if (context?.previous !== undefined)
        queryClient.setQueryData(detailQueryKey(table.id), context.previous);
      setActionError(apiErrorMessage(mutationError));
    },
    onSuccess: (result, input) => {
      let next = result.order;
      if (input.mode === 'request' && sessionUser !== undefined) {
        // La respuesta conserva el ítem como 'sent': la marca de la solicitud la
        // aplica el cliente con quién pidió y el motivo (regla 6).
        next = {
          ...next,
          items: next.items.map((item) =>
            item.id === input.item.id
              ? {
                  ...item,
                  status: 'void_requested',
                  voidRequestedBy: sessionUser,
                  voidRequestedAt: new Date().toISOString(),
                  voidRequestReason: input.reason,
                }
              : item,
          ),
        };
      }
      // La comanda de anulación viaja en la respuesta (regla 6): se adjunta a la
      // lista sin releer el detalle — el POST es la fuente de verdad del ciclo.
      const voidTicket: KitchenTicket | null =
        'ticket' in result && result.ticket !== undefined && result.ticket !== null
          ? (result.ticket as KitchenTicket)
          : null;
      flushSync(() => {
        queryClient.setQueryData<MesaDetail>(detailQueryKey(table.id), (prev): MesaDetail => {
          const prevTickets: KitchenTicket[] = prev?.tickets ?? [];
          return {
            table: prev?.table ?? table,
            order: next,
            tickets:
              voidTicket !== null && voidTicket !== undefined
                ? prevTickets.some((known) => known.id === voidTicket.id)
                  ? prevTickets
                  : [...prevTickets, voidTicket]
                : prevTickets,
          };
        });
      });
      void queryClient.invalidateQueries({ queryKey: tablesQueryKey() });
      closePanel();
      setActionError(undefined);
    },
    onSettled: () => {
      sending.current = false;
    },
  });

  const openVoidPanel = (item: OrderItem, mode: 'request' | 'approve' | 'direct') => {
    setPanel({ kind: 'void', item, mode, key: createIdempotencyKey() });
    setReason(mode === 'approve' ? (item.voidRequestReason ?? '') : '');
    setLocalError(undefined);
    setActionError(undefined);
  };

  const extraTables = current.tables.filter((covered) => covered.id !== table.id);
  const visibleTickets = tickets.filter((ticket) => isAdmin || ticket.kind !== 'void');
  const moveCandidates = salon.filter(
    (candidate) =>
      candidate.isActive &&
      candidate.state === 'free' &&
      !current.tables.some((covered) => covered.id === candidate.id),
  );
  const joinCandidates = salon.filter(
    (candidate) =>
      candidate.isActive && candidate.state !== 'free' && candidate.order?.id !== current.id,
  );

  return (
    <>
      <h1 className="text-3xl font-bold">{table.name}</h1>
      <div className="space-y-1">
        <p>{orderStateLabel(current)}</p>
        {extraTables.map((covered) => (
          <p key={covered.id}>y {covered.name}</p>
        ))}
      </div>
      {openError !== undefined && <p role="alert">{openError}</p>}
      {notice !== null && <p role="status">{notice}</p>}
      <p>
        <Link href="/mozo" className="text-accent underline underline-offset-4">
          Volver a las mesas
        </Link>
      </p>

      <div className="order-summary">
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Pedido</h2>
          {current.items.length === 0 ? (
            <p>Todavía no hay ítems enviados.</p>
          ) : (
            <ul className="space-y-3">
              {current.items.map((item) => (
                <OrderItemRow
                  key={item.id}
                  item={item}
                  tableId={table.id}
                  isAdmin={isAdmin}
                  onRequestVoid={(target) => openVoidPanel(target, 'request')}
                  onVoid={(target) => openVoidPanel(target, 'direct')}
                  onApproveVoid={(target) => openVoidPanel(target, 'approve')}
                  onRejectVoid={(target) => {
                    setPanel({ kind: 'reject', item: target, key: createIdempotencyKey() });
                    setActionError(undefined);
                  }}
                />
              ))}
            </ul>
          )}
          <p className="font-semibold">Total {formatSoles(current.totalCents)}</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Acciones</h2>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/mozo/mesas/${table.id}/agregar`}
              className="inline-flex min-h-12 items-center text-accent underline underline-offset-4"
            >
              Agregar ítems
            </Link>
            {current.readyAt === null ? (
              <Button
                className="min-h-12"
                isDisabled={signal.isPending}
                onPress={() =>
                  run({ isPending: signal.isPending, mutate: () => signal.mutate('ready') })
                }
              >
                Marcar pedido listo
              </Button>
            ) : (
              <Button
                className="min-h-12"
                isDisabled={signal.isPending}
                onPress={() =>
                  run({ isPending: signal.isPending, mutate: () => signal.mutate('served') })
                }
              >
                Marcar servido
              </Button>
            )}
            {current.billRequestedAt === null && (
              <Button
                className="min-h-12"
                isDisabled={signal.isPending}
                onPress={() =>
                  run({ isPending: signal.isPending, mutate: () => signal.mutate('request-bill') })
                }
              >
                Pedir la cuenta
              </Button>
            )}
            <Button
              className="min-h-12"
              isDisabled={move.isPending}
              onPress={() => {
                setPanel({ kind: 'move' });
                // La primera candidata queda elegida: es la mesa que el select muestra.
                setMoveTarget(String(moveCandidates[0]?.id ?? ''));
                setActionError(undefined);
              }}
            >
              Mover a otra mesa
            </Button>
            <Button
              className="min-h-12"
              isDisabled={join.isPending}
              onPress={() => {
                setPanel({ kind: 'join' });
                setJoinTarget(String(joinCandidates[0]?.id ?? ''));
                setActionError(undefined);
              }}
            >
              Unir mesa
            </Button>
            {extraTables.map((covered) => (
              <Button
                key={covered.id}
                className="min-h-12"
                isDisabled={leave.isPending}
                onPress={() => {
                  setPanel({ kind: 'separate', table: covered });
                  setActionError(undefined);
                }}
              >
                Separar {covered.name}
              </Button>
            ))}
            <Button
              className="min-h-12"
              isDisabled={cancel.isPending}
              onPress={() => {
                setPanel({ kind: 'cancel' });
                setReason('');
                setLocalError(undefined);
                setActionError(undefined);
              }}
            >
              Cancelar pedido
            </Button>
          </div>
          {actionError !== undefined && <p role="alert">{actionError}</p>}

          {panel?.kind === 'move' && (
            <div className="space-y-3 rounded-2xl border border-separator bg-surface px-4 py-4">
              <select
                className="min-h-12 w-full rounded-xl border border-separator bg-surface px-3"
                value={moveTarget}
                onChange={(event) => setMoveTarget(event.target.value)}
              >
                {moveCandidates.map((candidate) => (
                  <option key={candidate.id} value={String(candidate.id)}>
                    {candidate.name}
                  </option>
                ))}
              </select>
              <div className="flex flex-wrap gap-3">
                <Button
                  className="min-h-12"
                  isDisabled={moveTarget === '' || move.isPending}
                  onPress={() =>
                    run({
                      isPending: move.isPending,
                      mutate: () => move.mutate(Number(moveTarget)),
                    })
                  }
                >
                  Mover
                </Button>
                <Button className="min-h-12" onPress={closePanel}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
          {panel?.kind === 'join' && (
            <div className="space-y-3 rounded-2xl border border-separator bg-surface px-4 py-4">
              <select
                className="min-h-12 w-full rounded-xl border border-separator bg-surface px-3"
                value={joinTarget}
                onChange={(event) => setJoinTarget(event.target.value)}
              >
                {joinCandidates.map((candidate) => (
                  <option key={candidate.id} value={String(candidate.id)}>
                    {candidate.name}
                  </option>
                ))}
              </select>
              <div className="flex flex-wrap gap-3">
                <Button
                  className="min-h-12"
                  isDisabled={joinTarget === '' || join.isPending}
                  onPress={() =>
                    run({
                      isPending: join.isPending,
                      mutate: () => join.mutate(Number(joinTarget)),
                    })
                  }
                >
                  Unir
                </Button>
                <Button className="min-h-12" onPress={closePanel}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
          {panel?.kind === 'separate' && (
            <div className="space-y-3 rounded-2xl border border-separator bg-surface px-4 py-4">
              <p>{`¿Separar ${panel.table.name}? Quedará libre.`}</p>
              <div className="flex flex-wrap gap-3">
                <Button
                  className="min-h-12"
                  isDisabled={leave.isPending}
                  onPress={() =>
                    run({
                      isPending: leave.isPending,
                      mutate: () => leave.mutate(panel.table.id),
                    })
                  }
                >
                  Sí, separar
                </Button>
                <Button className="min-h-12" onPress={closePanel}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
          {panel?.kind === 'reject' && (
            <div className="space-y-3 rounded-2xl border border-separator bg-surface px-4 py-4">
              <p>
                {`¿Rechazar la anulación que pidió ${panel.item.voidRequestedBy?.displayName ?? ''}? El ítem sigue contando en la cuenta.`}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  className="min-h-12"
                  isDisabled={voidCycle.isPending}
                  onPress={() =>
                    run({
                      isPending: voidCycle.isPending,
                      mutate: () =>
                        voidCycle.mutate({
                          mode: 'reject',
                          item: panel.item,
                          reason: '',
                          key: panel.key,
                        }),
                    })
                  }
                >
                  Sí, rechazar
                </Button>
                <Button className="min-h-12" onPress={closePanel}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
          {panel?.kind === 'cancel' && (
            <ReasonDialog
              label="Motivo de la cancelación"
              value={reason}
              pending={cancel.isPending}
              localError={localError}
              onValue={setReason}
              onAccept={() => {
                const parsed = cancelOrderRequestSchema.safeParse({ reason });
                if (!parsed.success) {
                  setLocalError(issuesFromZod(parsed.error)[0]?.message ?? 'Revisa el motivo.');
                  return;
                }
                run({
                  isPending: cancel.isPending,
                  mutate: () => cancel.mutate(parsed.data.reason),
                });
              }}
              onCancel={closePanel}
            />
          )}
          {panel?.kind === 'void' && (
            <ReasonDialog
              label="Motivo de la anulación"
              value={reason}
              pending={voidCycle.isPending}
              localError={localError}
              onValue={setReason}
              onAccept={() => {
                const parsed = voidOrderItemRequestSchema.safeParse({ reason });
                if (!parsed.success) {
                  setLocalError(issuesFromZod(parsed.error)[0]?.message ?? 'Revisa el motivo.');
                  return;
                }
                if (panel?.kind !== 'void') return;
                run({
                  isPending: voidCycle.isPending,
                  mutate: () =>
                    voidCycle.mutate({
                      mode: panel.mode,
                      item: panel.item,
                      reason: parsed.data.reason,
                      key: panel.key,
                    }),
                });
              }}
              onCancel={closePanel}
            />
          )}
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Comandas enviadas</h2>
        {visibleTickets.length === 0 ? (
          <p>Todavía no se envió ninguna comanda.</p>
        ) : (
          <ul className="space-y-3">
            {visibleTickets.map((ticket) => (
              <TicketBlock key={ticket.id} ticket={ticket} />
            ))}
          </ul>
        )}
      </section>
      <OrderTicketPrints orderId={orderId} isWaiter={canManagePrints} isAdmin={isAdmin} />
    </>
  );
}

/** Resuelve la mesa del listado y delega en la vista libre u ocupada (D-011-05). */
function WaiterTable() {
  const params = useParams();
  const tableId = Number(params.tableId);
  const [openError, setOpenError] = useState<string>();
  const tables = useQuery({
    queryKey: tablesQueryKey(),
    queryFn: getTables,
    retry: false,
    refetchInterval: 5000,
  });
  // El detalle arranca en paralelo: su queryFn espera la misma consulta del
  // salón (fetchQuery comparte la llamada en curso) y encadena el pedido y
  // las comandas, de modo que la mesa ocupada pinta completa en un solo render.
  const detail = useQuery({
    queryKey: detailQueryKey(tableId),
    queryFn: async ({ client }) => {
      const list = await client.fetchQuery({
        queryKey: tablesQueryKey(),
        queryFn: getTables,
      });
      const table =
        list.find((candidate) => candidate.id === tableId && candidate.isActive) ?? null;
      const orderId = table?.order?.id;
      const order = orderId === undefined ? null : await getOrder(orderId);
      const tickets = order === null ? [] : await getOrderTickets(order.id);
      return { table, order, tickets };
    },
    retry: false,
    refetchInterval: 5000,
  });
  if (tables.isPending)
    return (
      <p role="status" className="p-6 text-center">
        Cargando mesas...
      </p>
    );
  if (tables.isError)
    return (
      <div className="space-y-4 p-6 text-center">
        <p role="alert">No se pudo cargar el salón.</p>
        <Button
          className="min-h-12"
          onPress={() => {
            void tables.refetch();
          }}
        >
          Reintentar
        </Button>
      </div>
    );
  const table = tables.data.find((candidate) => candidate.id === tableId && candidate.isActive);
  if (table === undefined || !Number.isInteger(tableId) || tableId <= 0)
    return (
      <>
        <h1 className="text-3xl font-bold">Mesa</h1>
        <p>Esa mesa no existe.</p>
        <p>
          <Link href="/mozo" className="text-accent underline underline-offset-4">
            Volver a las mesas
          </Link>
        </p>
      </>
    );
  const detailOrder = detail.data?.order ?? null;
  if (table.order?.id === undefined && detailOrder === null)
    return <FreeTable table={table} error={openError} onErrorChange={setOpenError} />;
  if (detail.isPending || (table.order?.id !== undefined && detail.data?.order === null))
    return (
      <>
        <h1 className="text-3xl font-bold">{table.name}</h1>
        {openError !== undefined && <p role="alert">{openError}</p>}
        <p role="status" className="p-6 text-center">
          Cargando pedido...
        </p>
      </>
    );
  if (detail.isError) {
    const notFound =
      detail.error instanceof ApiError && detail.error.status === 404 ? detail.error : null;
    if (notFound !== null)
      return (
        <>
          <h1 className="text-3xl font-bold">{table.name}</h1>
          <p>{notFound.message}</p>
          <p>
            <Link href="/mozo" className="text-accent underline underline-offset-4">
              Volver a las mesas
            </Link>
          </p>
        </>
      );
    return (
      <>
        <h1 className="text-3xl font-bold">{table.name}</h1>
        <div className="space-y-4 p-6 text-center">
          <p role="alert">No se pudo cargar el pedido.</p>
          <Button
            className="min-h-12"
            onPress={() => {
              void detail.refetch();
            }}
          >
            Reintentar
          </Button>
        </div>
      </>
    );
  }
  const order = detailOrder ?? detail.data.order;
  if (order === null)
    return <FreeTable table={table} error={openError} onErrorChange={setOpenError} />;
  const orderId = order.id;
  return (
    <OccupiedTable
      table={table}
      orderId={orderId}
      salon={tables.data}
      current={order}
      tickets={detail.data?.tickets ?? []}
      openError={openError}
    />
  );
}

export default function Page() {
  return (
    <RoleGuard area="/mozo">
      <WaiterTable />
    </RoleGuard>
  );
}
