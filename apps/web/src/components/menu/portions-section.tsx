'use client';

import { Button } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PRICE_INPUT_MESSAGE } from '@polleria/shared';
import type { Cut, Portion, ProductPortion } from '@polleria/shared';
import { useRef, useState } from 'react';
import { apiErrorMessage } from '../../lib/api/error-message.ts';
import { issuesFromApiError, splitIssues, uniqueMessages } from '../../lib/api/issues.ts';
import { getProductPortions, replaceProductPortions } from '../../lib/api/products.ts';
import { priceFieldCents, solesFieldValue } from '../../lib/menu-form.ts';
import { formatPortionCutLabel } from '../../lib/menu-labels.ts';
import { LabeledInput } from '../users/labeled-input.tsx';

/** Las seis filas fijas de la grilla de presentaciones, en el orden de la spec (10.5). */
const GRID_ROWS: ReadonlyArray<{ portion: Portion; cut: Cut | null }> = [
  { portion: 'eighth', cut: 'breast' },
  { portion: 'eighth', cut: 'leg' },
  { portion: 'quarter', cut: 'breast' },
  { portion: 'quarter', cut: 'leg' },
  { portion: 'half', cut: null },
  { portion: 'whole', cut: null },
];

interface GridRowState {
  checked: boolean;
  price: string;
}

/** Estado inicial de la grilla: las presentaciones cargadas llegan marcadas con su precio en soles. */
function buildRows(portions: ProductPortion[]): GridRowState[] {
  return GRID_ROWS.map(({ portion, cut }) => {
    const found = portions.find((row) => row.portion === portion && row.cut === cut);
    return {
      checked: found !== undefined,
      price: found ? solesFieldValue(found.priceCents) : '',
    };
  });
}

function PortionsGrid({ productId, portions }: { productId: number; portions: ProductPortion[] }) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<GridRowState[]>(() => buildRows(portions));
  const [rowErrors, setRowErrors] = useState<ReadonlyMap<number, string[]>>(new Map());
  const [sectionErrors, setSectionErrors] = useState<string[]>([]);
  /** Índices de la grilla en el orden del último envío: el 400 usa portions.N del envío. */
  const submittedOrder = useRef<number[]>([]);
  const sending = useRef(false);
  const save = useMutation({
    mutationFn: (body: {
      portions: { portion: string; cut: string | null; priceCents: number }[];
    }) => replaceProductPortions(productId, body),
    onSuccess: (data) => {
      // La respuesta del PUT es la verdad del servidor: la grilla se repuebla con ella.
      setRows(buildRows(data));
      setRowErrors(new Map());
      setSectionErrors([]);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
    },
    onError: (error) => {
      // Los issues 'portions.N.*' del 400 van a la fila N del envío (D-008-12); los de
      // raíz y cualquier otro error van como mensaje de la sección.
      const issues = issuesFromApiError(error);
      if (issues.length === 0) {
        setRowErrors(new Map());
        setSectionErrors([apiErrorMessage(error)]);
        return;
      }
      const { byIndex, root } = splitIssues(issues, 'portions');
      const mapped = new Map<number, string[]>();
      const sectionMessages = [...root];
      for (const [sentIndex, messages] of byIndex) {
        const gridIndex = submittedOrder.current[sentIndex];
        if (gridIndex === undefined) sectionMessages.push(...messages);
        else mapped.set(gridIndex, messages);
      }
      setRowErrors(mapped);
      setSectionErrors(sectionMessages);
    },
    onSettled: () => {
      sending.current = false;
    },
  });
  const toggle = (index: number, checked: boolean) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, checked } : row)));
  };
  const editPrice = (index: number, price: string) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, price } : row)));
  };
  const submit = () => {
    if (sending.current || save.isPending) return;
    // Solo viajan las filas marcadas, en el orden fijo de la grilla; sin marcadas va [].
    const order: number[] = [];
    const body: { portion: string; cut: string | null; priceCents: number }[] = [];
    const localErrors = new Map<number, string[]>();
    GRID_ROWS.forEach((spec, index) => {
      const row = rows[index];
      if (!row?.checked) return;
      order.push(index);
      const priceCents = priceFieldCents(row.price);
      if (priceCents === null) {
        localErrors.set(index, [PRICE_INPUT_MESSAGE]);
      } else {
        body.push({ portion: spec.portion, cut: spec.cut, priceCents });
      }
    });
    setRowErrors(localErrors);
    setSectionErrors([]);
    if (localErrors.size > 0) return;
    submittedOrder.current = order;
    sending.current = true;
    save.mutate({ portions: body });
  };
  return (
    <>
      <p className="text-sm text-muted">
        Mientras tenga presentaciones cargadas, la categoría del producto no se puede cambiar.
      </p>
      {rows.every((row) => !row.checked) && (
        <p className="text-sm text-muted">
          Marca las presentaciones que vendes y escribe su precio.
        </p>
      )}
      <div className="grid gap-3">
        {GRID_ROWS.map(({ portion, cut }, index) => {
          const label = formatPortionCutLabel(portion, cut);
          const row = rows[index] ?? { checked: false, price: '' };
          return (
            <div key={label} className="space-y-2 rounded-xl border border-separator p-4">
              <label className="flex min-h-12 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={row.checked}
                  disabled={save.isPending}
                  onChange={(event) => {
                    toggle(index, event.target.checked);
                  }}
                  className="h-5 w-5 accent-accent"
                />
                <span className="font-semibold">{label}</span>
              </label>
              <LabeledInput
                id={`porcion-${productId}-${index}-precio`}
                label={`Precio de ${label}`}
                inputMode="decimal"
                disabled={!row.checked || save.isPending}
                value={row.price}
                onChange={(event) => {
                  editPrice(index, event.target.value);
                }}
              />
              {/* Una fila tampoco repite el mismo mensaje dos veces (ADV-008-42). */}
              {uniqueMessages(rowErrors.get(index) ?? []).map((message) => (
                <p key={message} className="text-sm text-danger">
                  {message}
                </p>
              ))}
            </div>
          );
        })}
      </div>
      {/* Dos issues con el mismo texto se ven una sola vez (ADV-008-42). */}
      {uniqueMessages(sectionErrors).map((message) => (
        <p key={message} role="alert" className="text-danger">
          {message}
        </p>
      ))}
      {save.isSuccess && <p role="status">Presentaciones guardadas.</p>}
      <Button className="min-h-12 w-full text-lg" isDisabled={save.isPending} onPress={submit}>
        {save.isPending ? 'Guardando...' : 'Guardar presentaciones'}
      </Button>
    </>
  );
}

/**
 * Sección 'Presentaciones del pollo' de la edición (AC-12/13): visible solo cuando la
 * categoría guardada es chicken (la monta la página). Es un grupo accesible nombrado
 * por su h2: el E2E la busca como getByRole('group', { name: 'Presentaciones del pollo' }).
 */
export function PortionsSection({ productId }: { productId: number }) {
  const portions = useQuery({
    queryKey: ['admin', 'products', productId, 'portions'],
    queryFn: () => getProductPortions(productId),
    retry: false,
  });
  if (portions.isPending) {
    return (
      <section className="space-y-4">
        <p role="status" className="p-6 text-center">
          Cargando presentaciones...
        </p>
      </section>
    );
  }
  const headingId = `presentaciones-${productId}-titulo`;
  return (
    <section role="group" aria-labelledby={headingId} className="space-y-4">
      <h2 id={headingId} className="text-xl font-semibold">
        Presentaciones del pollo
      </h2>
      {portions.isError ? (
        <div className="space-y-4 p-6 text-center">
          <p role="alert">{apiErrorMessage(portions.error)}</p>
          <Button
            className="min-h-12"
            onPress={() => {
              void portions.refetch();
            }}
          >
            Reintentar
          </Button>
        </div>
      ) : (
        <PortionsGrid productId={productId} portions={portions.data ?? []} />
      )}
    </section>
  );
}
