// AC-04. Spec 011 — archivo nuevo: va EN ROJO hasta que T-09 cree
// frontend/src/lib/idempotency.ts (createIdempotencyKey) y sume en
// frontend/src/lib/menu-labels.ts las tres etiquetas del salón
// (TABLE_STATE_LABELS, ORDER_ITEM_STATUS_LABELS, KITCHEN_TICKET_KIND_LABELS).
//
// Elección del módulo de etiquetas: menu-labels.ts — el contrato interno de la
// spec (§11) y tasks.md ("las etiquetas del salón se suman a las etiquetas del
// producto") lo señalan como primera opción, y mantiene un solo módulo de
// etiquetas de interfaz en español indexadas por enums de shared, igual que
// ROLE_LABELS. Este test fija ese módulo.
import { describe, expect, it } from 'vitest';
import {
  KITCHEN_TICKET_KINDS,
  ORDER_ITEM_STATUSES,
  TABLE_STATES,
  idempotencyKeySchema,
} from '@polleria/shared';
import type { KitchenTicketKind, OrderItemStatus, TableState } from '@polleria/shared';
import { createIdempotencyKey } from './idempotency.ts';
import {
  KITCHEN_TICKET_KIND_LABELS,
  ORDER_ITEM_STATUS_LABELS,
  TABLE_STATE_LABELS,
} from './menu-labels.ts';

describe('011: clave de idempotencia y etiquetas del salón', () => {
  it('AC-04: createIdempotencyKey devuelve una cadena que pasa idempotencyKeySchema', () => {
    for (let index = 0; index < 5; index += 1) {
      const key = createIdempotencyKey();
      const result = idempotencyKeySchema.safeParse(key);
      expect(result.success).toBe(true);
    }
  });

  it('AC-04: dos llamadas seguidas a createIdempotencyKey devuelven valores distintos', () => {
    const first = createIdempotencyKey();
    const second = createIdempotencyKey();
    expect(first).not.toBe(second);
  });

  it('AC-04: TABLE_STATE_LABELS es exactamente las cuatro etiquetas del estado derivado', () => {
    const expected: Record<TableState, string> = {
      free: 'Libre',
      occupied: 'Ocupada',
      ready: 'Pedido listo',
      bill_requested: 'Pidió la cuenta',
    };
    expect(TABLE_STATE_LABELS).toEqual(expected);
    expect(Object.keys(TABLE_STATE_LABELS).sort()).toEqual([...TABLE_STATES].sort());
  });

  it('AC-04: ORDER_ITEM_STATUS_LABELS es exactamente las tres etiquetas del ciclo del ítem', () => {
    const expected: Record<OrderItemStatus, string> = {
      sent: 'Enviado',
      void_requested: 'Anulación pedida',
      voided: 'Anulado',
    };
    expect(ORDER_ITEM_STATUS_LABELS).toEqual(expected);
    expect(Object.keys(ORDER_ITEM_STATUS_LABELS).sort()).toEqual([...ORDER_ITEM_STATUSES].sort());
  });

  it('AC-04: KITCHEN_TICKET_KIND_LABELS es exactamente las tres etiquetas de comanda', () => {
    const expected: Record<KitchenTicketKind, string> = {
      initial: 'Comanda inicial',
      additional: 'Adición',
      void: 'Anulación',
    };
    expect(KITCHEN_TICKET_KIND_LABELS).toEqual(expected);
    expect(Object.keys(KITCHEN_TICKET_KIND_LABELS).sort()).toEqual(
      [...KITCHEN_TICKET_KINDS].sort(),
    );
  });
});
