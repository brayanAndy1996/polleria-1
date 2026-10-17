import { describe, expect, it } from 'vitest';
import type { Order } from '@polleria/shared';
import { buildBill } from './bill.ts';

const order = (
  items: unknown[],
  totalCents = 0,
  tables = [{ id: 3, name: 'Mesa 3' }],
  fields: Record<string, unknown> = {},
) =>
  ({
    id: 12,
    status: 'open',
    tables,
    items,
    totalCents,
    openedBy: { id: 4, displayName: 'Rosa' },
    readyAt: null,
    billRequestedAt: null,
    ...fields,
  }) as unknown as Order;

const item = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  productId: 10,
  productName: 'Gaseosa',
  productCategory: 'drink',
  quantity: 1,
  portion: null,
  cut: null,
  priceCents: 400,
  breastEighths: 0,
  legEighths: 0,
  notes: null,
  sauces: [],
  components: [],
  status: 'sent',
  createdBy: { id: 4, displayName: 'Rosa' },
  createdAt: '2026-10-16T14:00:00.000Z',
  kitchenTicketId: 2,
  voidTicketId: null,
  voidedBy: null,
  voidedAt: null,
  voidReason: null,
  voidRequestedBy: null,
  voidRequestedAt: null,
  voidRequestReason: null,
  orderedAtTable: null,
  ...overrides,
});

describe('014: construir pre-cuenta desde precios copiados del pedido', () => {
  it('AC-02: suma ítems y cremas sin duplicar cremas por cantidad del ítem y excluye anulados', () => {
    const sent = item({
      quantity: 2,
      priceCents: 1000,
      sauces: [{ productId: 20, productName: 'Ají', quantity: 1, priceCents: 100 }],
      components: [
        {
          productId: 30,
          productName: 'Cuarto de pollo',
          quantity: 2,
          portion: 'quarter',
          cut: 'leg',
          breastEighths: 0,
          legEighths: 2,
        },
      ],
    });
    const pendingVoid = item({ id: 2, status: 'void_requested', quantity: 1, priceCents: 500 });
    const voided = item({ id: 3, status: 'voided', quantity: 1, priceCents: 9999 });

    const bill = buildBill(order([sent, pendingVoid, voided]), '2026-10-16T15:00:00.000Z');

    expect(bill.totalCents).toBe(2600);
    expect(bill.items.map((line) => line.id)).toEqual([1, 2]);
    expect(bill.hasPendingVoids).toBe(true);
    expect(bill.canPay).toBe(false);
    expect(bill.items[0]).not.toHaveProperty('createdBy');
    expect(bill.items[0]).not.toHaveProperty('voidRequestReason');
  });

  it('AC-02: total cero o fuera de rango se puede revisar, pero no cobrar', () => {
    const zero = buildBill(order([item({ priceCents: 0 })]), '2026-10-16T15:00:00.000Z');
    const excessive = buildBill(
      order([item({ priceCents: 2147483647, quantity: 2 })]),
      '2026-10-16T15:00:00.000Z',
    );

    expect(zero.totalCents).toBe(0);
    expect(zero.canPay).toBe(false);
    expect(excessive.totalCents).toBeGreaterThan(2147483647);
    expect(excessive.canPay).toBe(false);
  });

  it('AC-02: una cuenta sin ítems cobra cero y queda visible como no cobrable', () => {
    const empty = buildBill(order([]), '2026-10-16T15:00:00.000Z');

    expect(empty.items).toEqual([]);
    expect(empty.totalCents).toBe(0);
    expect(empty.canPay).toBe(false);
  });

  it('AC-03: el token es estable entre lecturas y no incluye generatedAt', () => {
    const source = order([item()], 400);
    const first = buildBill(source, '2026-10-16T15:00:00.000Z');
    const later = buildBill(source, '2026-10-16T15:05:00.000Z');

    expect(first.billToken).toMatch(/^[a-f0-9]{64}$/);
    expect(later.billToken).toBe(first.billToken);
    expect(later.generatedAt).not.toBe(first.generatedAt);
  });

  it('AC-03: un cambio de detalle operativo invalida el token aunque el total siga igual', () => {
    const first = buildBill(order([item({ notes: 'Sin hielo' })]), '2026-10-16T15:00:00.000Z');
    const changed = buildBill(order([item({ notes: 'Con hielo' })]), '2026-10-16T15:00:00.000Z');

    expect(changed.totalCents).toBe(first.totalCents);
    expect(changed.billToken).not.toBe(first.billToken);
  });

  it('AC-03: un cambio de mesa invalida el token aunque los importes sean iguales', () => {
    const first = buildBill(order([item()]), '2026-10-16T15:00:00.000Z');
    const moved = buildBill(
      order([item()], 400, [
        { id: 3, name: 'Mesa 3' },
        { id: 5, name: 'Mesa 5' },
      ]),
      '2026-10-16T15:00:00.000Z',
    );

    expect(moved.totalCents).toBe(first.totalCents);
    expect(moved.billToken).not.toBe(first.billToken);
  });

  it('AC-03: ordenar mesas, ítems, cremas y componentes no cambia el token', () => {
    const itemA = item({
      id: 1,
      sauces: [
        { productId: 22, productName: 'Mayonesa', quantity: 1, priceCents: 0 },
        { productId: 20, productName: 'Ají', quantity: 1, priceCents: 0 },
      ],
      components: [
        {
          productId: 32,
          productName: 'Papas',
          quantity: 1,
          portion: null,
          cut: null,
          breastEighths: 0,
          legEighths: 0,
        },
        {
          productId: 30,
          productName: 'Pollo',
          quantity: 1,
          portion: 'quarter',
          cut: 'leg',
          breastEighths: 0,
          legEighths: 2,
        },
      ],
    });
    const itemB = item({ id: 2, productId: 11, productName: 'Papas', priceCents: 100 });
    const unordered = buildBill(
      order([itemB, itemA], 500, [
        { id: 5, name: 'Mesa 5' },
        { id: 3, name: 'Mesa 3' },
      ]),
      '2026-10-16T15:00:00.000Z',
    );
    const ordered = buildBill(
      order([itemA, itemB], 500, [
        { id: 3, name: 'Mesa 3' },
        { id: 5, name: 'Mesa 5' },
      ]),
      '2026-10-16T15:01:00.000Z',
    );

    expect(ordered.billToken).toBe(unordered.billToken);
  });

  it('AC-03: ready, cuenta solicitada y autoría no invalidan la cuenta', () => {
    const first = buildBill(order([item()]), '2026-10-16T15:00:00.000Z');
    const operationallyChanged = buildBill(
      order(
        [item({ createdBy: { id: 8, displayName: 'Juan' } })],
        400,
        [{ id: 3, name: 'Mesa 3' }],
        {
          openedBy: { id: 8, displayName: 'Juan' },
          readyAt: '2026-10-16T14:30:00.000Z',
          billRequestedAt: '2026-10-16T14:45:00.000Z',
        },
      ),
      '2026-10-16T15:03:00.000Z',
    );

    expect(operationallyChanged.billToken).toBe(first.billToken);
  });

  it('AC-03: solicitar anulación cambia el token e impide el cobro', () => {
    const first = buildBill(order([item()]), '2026-10-16T15:00:00.000Z');
    const pendingVoid = buildBill(
      order([item({ status: 'void_requested' })]),
      '2026-10-16T15:00:00.000Z',
    );

    expect(pendingVoid.totalCents).toBe(first.totalCents);
    expect(pendingVoid.hasPendingVoids).toBe(true);
    expect(pendingVoid.canPay).toBe(false);
    expect(pendingVoid.billToken).not.toBe(first.billToken);
  });

  it('AC-03: cambios de carta no alteran el token basado en precio y nombre copiados', () => {
    const frozenItem = item({ productName: 'Gaseosa', priceCents: 400 });
    const first = buildBill(
      order([frozenItem], 400, [{ id: 3, name: 'Mesa 3' }], {
        currentCatalog: { productId: 10, name: 'Gaseosa', priceCents: 400 },
      }),
      '2026-10-16T15:00:00.000Z',
    );
    const menuChanged = buildBill(
      order([frozenItem], 400, [{ id: 3, name: 'Mesa 3' }], {
        currentCatalog: { productId: 10, name: 'Gaseosa grande', priceCents: 700 },
      }),
      '2026-10-16T15:00:00.000Z',
    );

    expect(menuChanged.items[0]?.productName).toBe('Gaseosa');
    expect(menuChanged.items[0]?.priceCents).toBe(400);
    expect(menuChanged.billToken).toBe(first.billToken);
  });
});
