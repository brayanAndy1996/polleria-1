import { describe, expect, it } from 'vitest';
import { paymentSchema, type Payment, type UserRef } from '@polleria/shared';
import {
  buildDailySalesReport,
  dailySalesQuerySchema,
  dailySalesReportSchema,
  salesDateSchema,
} from './reports.ts';

type SnapshotItem = Payment['snapshot']['bill']['items'][number];

function item(
  id: number,
  product: Pick<
    SnapshotItem,
    'productId' | 'productName' | 'productCategory' | 'quantity' | 'priceCents' | 'portion' | 'cut'
  >,
  options: Partial<Omit<SnapshotItem, 'id'>> = {},
): SnapshotItem {
  return {
    ...product,
    breastEighths: 0,
    legEighths: 0,
    notes: null,
    sauces: [],
    components: [],
    status: 'sent',
    ...options,
    id,
  };
}

function payment(
  id: number,
  paidAt: string,
  method: Payment['method'],
  items: SnapshotItem[],
  receivedCents?: number,
): Payment {
  const amountCents = items.reduce(
    (sum, row) =>
      sum +
      row.quantity * row.priceCents +
      row.sauces.reduce((sauceSum, sauce) => sauceSum + sauce.quantity * sauce.priceCents, 0),
    0,
  );
  const received = receivedCents ?? amountCents;
  const cashier = { id: 90, displayName: 'Cajera' };
  const bill = {
    orderId: id + 100,
    tables: [],
    items,
    totalCents: amountCents,
    hasPendingVoids: false,
    canPay: true,
    billToken: 'a'.repeat(64),
    generatedAt: paidAt,
  };
  const snapshot = {
    version: 1 as const,
    bill,
    cashier,
    method,
    amountCents,
    receivedCents: received,
    changeCents: received - amountCents,
    paidAt,
  };
  return {
    id,
    orderId: bill.orderId,
    cashier,
    method,
    amountCents,
    receivedCents: received,
    changeCents: received - amountCents,
    paidAt,
    snapshot,
  };
}

const chicken = (id = 1, overrides: Partial<Omit<SnapshotItem, 'id'>> = {}) =>
  item(
    id,
    {
      productId: 10,
      productName: 'Cuarto histórico',
      productCategory: 'chicken',
      quantity: 1,
      priceCents: 1700,
      portion: 'quarter',
      cut: 'leg',
    },
    overrides,
  );

const generatedAt = '2026-10-18T12:00:00.000Z';
const authors = (...entries: Array<[number, UserRef]>): ReadonlyMap<number, UserRef> =>
  new Map(entries);

describe('016: reporte diario de ventas', () => {
  it('AC-02: acepta fechas reales, consulta estricta y un día vacío con 24 horas y cuatro medios', () => {
    expect(salesDateSchema.safeParse('2026-02-28').success).toBe(true);
    expect(salesDateSchema.safeParse('2026-02-29').success).toBe(false);
    expect(salesDateSchema.safeParse('0000-01-01').success).toBe(false);
    expect(dailySalesQuerySchema.safeParse({ date: '2026-10-18' }).success).toBe(true);
    expect(dailySalesQuerySchema.safeParse({ date: '2026-10-18', other: 'x' }).success).toBe(false);

    const report = buildDailySalesReport({
      date: '2026-10-18',
      generatedAt,
      payments: [],
      itemAuthors: authors(),
    });
    expect(report).toMatchObject({
      date: '2026-10-18',
      timeZone: 'America/Lima',
      totalCents: 0,
      paymentCount: 0,
      methods: [
        { method: 'cash', totalCents: 0, paymentCount: 0 },
        { method: 'yape', totalCents: 0, paymentCount: 0 },
        { method: 'plin', totalCents: 0, paymentCount: 0 },
        { method: 'card', totalCents: 0, paymentCount: 0 },
      ],
      hours: Array.from({ length: 24 }, (_, hour) => ({
        hour,
        totalCents: 0,
        paymentCount: 0,
      })),
      products: [],
      authors: [],
    });
    expect(dailySalesReportSchema.parse(report)).toEqual(report);
    expect(() =>
      dailySalesReportSchema.parse({ ...report, totalCents: Number.MAX_SAFE_INTEGER + 1 }),
    ).toThrow();
  });

  it('AC-02/03/06: usa paidAt en el día Lima y concilia amountCents, medio y hora sin sumar vuelto', () => {
    const rows = [
      payment(1, '2026-10-18T06:00:00.000Z', 'cash', [chicken(1)], 2500),
      payment(2, '2026-10-18T05:00:00.000Z', 'yape', [
        item(2, {
          productId: 10,
          productName: 'Cuarto histórico',
          productCategory: 'chicken',
          quantity: 2,
          priceCents: 300,
          portion: 'quarter',
          cut: 'leg',
        }),
      ]),
      payment(3, '2026-10-19T04:59:59.999Z', 'card', [
        item(3, {
          productId: 11,
          productName: 'Bebida',
          productCategory: 'drink',
          quantity: 1,
          priceCents: 400,
          portion: null,
          cut: null,
        }),
      ]),
    ];
    const map = authors(
      [1, { id: 7, displayName: 'Ana' }],
      [2, { id: 8, displayName: 'Luis' }],
      [3, { id: 7, displayName: 'Ana' }],
    );
    const report = buildDailySalesReport({
      date: '2026-10-18',
      generatedAt,
      payments: rows,
      itemAuthors: map,
    });

    expect(report.totalCents).toBe(2700);
    expect(report.paymentCount).toBe(3);
    expect(report.methods).toEqual([
      { method: 'cash', totalCents: 1700, paymentCount: 1 },
      { method: 'yape', totalCents: 600, paymentCount: 1 },
      { method: 'plin', totalCents: 0, paymentCount: 0 },
      { method: 'card', totalCents: 400, paymentCount: 1 },
    ]);
    expect(report.hours[23]).toMatchObject({ totalCents: 400, paymentCount: 1 });
    expect(report.hours[0]).toMatchObject({ totalCents: 600, paymentCount: 1 });
    expect(report.hours[1]).toMatchObject({ totalCents: 1700, paymentCount: 1 });
    expect(report.products.reduce((sum, row) => sum + row.totalCents, 0)).toBe(report.totalCents);
    expect(report.authors.reduce((sum, row) => sum + row.totalCents, 0)).toBe(report.totalCents);
    const beforeDay = payment(4, '2026-10-18T04:59:59.999Z', 'cash', [chicken(4)]);
    expect(() =>
      buildDailySalesReport({
        date: '2026-10-18',
        generatedAt,
        payments: [beforeDay],
        itemAuthors: authors([4, { id: 7, displayName: 'Ana' }]),
      }),
    ).toThrow(TypeError);
    const afterDay = payment(5, '2026-10-19T05:00:00.000Z', 'cash', [chicken(5)]);
    expect(() =>
      buildDailySalesReport({
        date: '2026-10-18',
        generatedAt,
        payments: [afterDay],
        itemAuthors: authors([5, { id: 7, displayName: 'Ana' }]),
      }),
    ).toThrow(TypeError);
  });

  it('AC-03/06: suma pagos válidos por encima del límite int32 sin perder precisión', () => {
    const largeItems = (firstId: number) =>
      Array.from({ length: 80 }, (_, index) =>
        item(firstId + index, {
          productId: 10,
          productName: 'Cuarto histórico',
          productCategory: 'chicken',
          quantity: 99,
          priceCents: 99_999,
          portion: 'quarter',
          cut: 'leg',
        }),
      );
    const first = payment(20, '2026-10-18T15:00:00.000Z', 'cash', largeItems(1000));
    const second = payment(21, '2026-10-18T16:00:00.000Z', 'card', largeItems(2000));
    const third = payment(22, '2026-10-18T17:00:00.000Z', 'yape', largeItems(3000));
    const itemAuthors = authors(
      ...[
        ...first.snapshot.bill.items,
        ...second.snapshot.bill.items,
        ...third.snapshot.bill.items,
      ].map((row) => [row.id, { id: 7, displayName: 'Ana' }] as [number, UserRef]),
    );

    expect(paymentSchema.safeParse(first).success).toBe(true);
    expect(paymentSchema.safeParse(second).success).toBe(true);
    expect(paymentSchema.safeParse(third).success).toBe(true);
    const report = buildDailySalesReport({
      date: '2026-10-18',
      generatedAt,
      payments: [first, second, third],
      itemAuthors,
    });
    expect(report.totalCents).toBe(2_375_976_240);
    expect(report.totalCents).toBeGreaterThan(2_147_483_647);
    expect(report.authors).toEqual([{ userId: 7, displayName: 'Ana', totalCents: 2_375_976_240 }]);
  });

  it('AC-04: agrupa snapshot histórico, presentación, combo y crema ya resuelta sin multiplicar componentes', () => {
    const quarter = chicken(1, { quantity: 2 });
    const combo = item(
      2,
      {
        productId: 20,
        productName: 'Combo histórico',
        productCategory: 'combo',
        quantity: 1,
        priceCents: 2500,
        portion: null,
        cut: null,
      },
      {
        components: [
          {
            productId: 10,
            productName: 'Pollo componente',
            quantity: 2,
            portion: 'quarter',
            cut: 'breast',
            breastEighths: 2,
            legEighths: 0,
          },
        ],
        sauces: [{ productId: 30, productName: 'Crema histórica', quantity: 2, priceCents: 50 }],
      },
    );
    const report = buildDailySalesReport({
      date: '2026-10-18',
      generatedAt,
      payments: [payment(4, '2026-10-18T17:00:00.000Z', 'plin', [quarter, combo])],
      itemAuthors: authors(
        [1, { id: 7, displayName: 'Ana' }],
        [2, { id: 9, displayName: 'Admin histórico' }],
      ),
    });

    expect(report.totalCents).toBe(6000);
    expect(report.products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productId: 10,
          productName: 'Cuarto histórico',
          portion: 'quarter',
          cut: 'leg',
          quantity: 2,
          totalCents: 3400,
        }),
        expect.objectContaining({
          productId: 20,
          productName: 'Combo histórico',
          portion: null,
          cut: null,
          quantity: 1,
          totalCents: 2600,
        }),
      ]),
    );
    expect(report.products).toHaveLength(2);
    expect(report.authors).toEqual(
      expect.arrayContaining([
        { userId: 7, displayName: 'Ana', totalCents: 3400 },
        { userId: 9, displayName: 'Admin histórico', totalCents: 2600 },
      ]),
    );
  });

  it('AC-05: conserva autores de ítem aunque la referencia pura solo lleve su etiqueta actual', () => {
    const report = buildDailySalesReport({
      date: '2026-10-18',
      generatedAt,
      payments: [payment(5, '2026-10-18T16:00:00.000Z', 'cash', [chicken(1)])],
      // En servicio, estas referencias pueden apuntar a usuarios admin o inactivos.
      itemAuthors: authors([1, { id: 31, displayName: 'Admin inactivo' }]),
    });
    expect(report.authors).toEqual([
      { userId: 31, displayName: 'Admin inactivo', totalCents: 1700 },
    ]);
  });

  it('AC-06: rechaza ids repetidos, autores faltantes y etiquetas incoherentes', () => {
    const valid = payment(6, '2026-10-18T16:00:00.000Z', 'cash', [chicken(1)]);
    const input = {
      date: '2026-10-18',
      generatedAt,
      payments: [valid],
      itemAuthors: authors([1, { id: 7, displayName: 'Ana' }]),
    };
    expect(() => buildDailySalesReport({ ...input, payments: [valid, valid] })).toThrow(TypeError);
    expect(() => buildDailySalesReport({ ...input, itemAuthors: authors() })).toThrow(TypeError);
    expect(() =>
      buildDailySalesReport({
        ...input,
        payments: [
          valid,
          payment(12, '2026-10-18T17:00:00.000Z', 'yape', [
            chicken(1, { quantity: 1, priceCents: 100 }),
          ]),
        ],
        itemAuthors: authors([1, { id: 7, displayName: 'Ana' }]),
      }),
    ).toThrow(TypeError);
    expect(() =>
      buildDailySalesReport({
        ...input,
        payments: [
          valid,
          payment(11, '2026-10-18T17:00:00.000Z', 'yape', [
            chicken(2, { quantity: 1, priceCents: 100 }),
          ]),
        ],
        itemAuthors: authors(
          [1, { id: 7, displayName: 'Ana' }],
          [2, { id: 7, displayName: 'Otra etiqueta' }],
        ),
      }),
    ).toThrow(TypeError);
  });
});
