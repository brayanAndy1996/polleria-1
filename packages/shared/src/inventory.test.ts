import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from './errors.ts';
import {
  INVENTORY_ADJUSTMENT_MAX,
  INVENTORY_CHICKENS_MAX,
  INVENTORY_QUANTITY_MAX,
  INVENTORY_RECEIPT_MAX,
  applyInventoryDelta,
  calculateInventoryDemand,
  chickenBatchEighths,
  inventoryAdjustmentRequestSchema,
  inventoryBatchRequestSchema,
  inventoryControlRequestSchema,
  inventoryMovementSchema,
  inventoryMovementsResponseSchema,
  inventoryMutationResponseSchema,
  inventoryQuerySchema,
  inventoryReceiptRequestSchema,
  inventorySnapshotSchema,
} from './inventory.ts';
import type { InventoryConsumptionItem } from './inventory.ts';

const validSnapshot = {
  chicken: { enabled: true, breastEighths: 40, legEighths: 36 },
  drinks: [{ productId: 8, productName: 'Inca Kola', enabled: true, quantity: 12 }],
  generatedAt: '2026-10-17T12:30:00.000Z',
};
const validMovement = {
  id: 1,
  kind: 'breast',
  productId: null,
  productName: null,
  type: 'batch',
  delta: 40,
  quantityAfter: 40,
  enabledAfter: null,
  reason: 'Tanda inicial',
  actor: { id: 3, displayName: 'Ana' },
  ticketId: null,
  createdAt: '2026-10-17T12:30:00.000Z',
};

const chicken = (
  productId: number,
  breastEighths: number,
  legEighths: number,
  quantity = 1,
): InventoryConsumptionItem => ({
  productId,
  category: 'chicken',
  quantity,
  breastEighths,
  legEighths,
  components: [],
});

describe('015 inventory pure domain', () => {
  describe('AC-02: batch conversion and safe integer deltas', () => {
    it('converts each whole chicken into four eighths of each cut', () => {
      expect(chickenBatchEighths(10)).toEqual({ breastEighths: 40, legEighths: 40 });
      expect(chickenBatchEighths(1)).toEqual({ breastEighths: 4, legEighths: 4 });
    });

    it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER, INVENTORY_CHICKENS_MAX + 1])(
      'rejects invalid batch size %s',
      (chickens) => expect(() => chickenBatchEighths(chickens)).toThrow(RangeError),
    );

    it('applies positive and negative integer deltas without mutating the input value', () => {
      const startingQuantity = 40;
      expect(applyInventoryDelta(0, 1)).toBe(1);
      expect(applyInventoryDelta(startingQuantity, 8)).toBe(48);
      expect(applyInventoryDelta(startingQuantity, -8)).toBe(32);
      expect(startingQuantity).toBe(40);
    });

    it.each([
      [-1, 1],
      [1.5, 1],
      [INVENTORY_QUANTITY_MAX, 1],
      [0, -1],
      [INVENTORY_QUANTITY_MAX + 1, -1],
      [20, 0],
      [20, 1.25],
    ])(
      'rejects unsafe delta (%s, %s), including negative result and overflow',
      (quantity, delta) => {
        expect(() => applyInventoryDelta(quantity, delta)).toThrow(RangeError);
      },
    );

    it('publishes the documented operational limits', () => {
      expect(INVENTORY_QUANTITY_MAX).toBe(2_147_483_647);
      expect(INVENTORY_CHICKENS_MAX).toBe(10_000);
      expect(INVENTORY_RECEIPT_MAX).toBe(100_000);
      expect(INVENTORY_ADJUSTMENT_MAX).toBe(100_000);
    });
  });

  describe('AC-11: strict inventory request and response schemas', () => {
    it('exposes stable conflict codes for inventory business rules', () => {
      expect(ERROR_CODES).toMatchObject({
        INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
        STOCK_CONSUMPTION_UNDEFINED: 'STOCK_CONSUMPTION_UNDEFINED',
        INVENTORY_DISABLED: 'INVENTORY_DISABLED',
        INVENTORY_PRODUCT_INVALID: 'INVENTORY_PRODUCT_INVALID',
        INVENTORY_QUANTITY_OUT_OF_RANGE: 'INVENTORY_QUANTITY_OUT_OF_RANGE',
        PRODUCT_HAS_INVENTORY: 'PRODUCT_HAS_INVENTORY',
      });
    });

    it('validates and trims control, batch, receipt, adjustment and query requests', () => {
      expect(
        inventoryControlRequestSchema.parse({ enabled: true, reason: '  Apertura  ' }),
      ).toEqual({
        enabled: true,
        reason: 'Apertura',
      });
      expect(inventoryBatchRequestSchema.parse({ chickens: 10, reason: '  Compra  ' })).toEqual({
        chickens: 10,
        reason: 'Compra',
      });
      expect(inventoryReceiptRequestSchema.parse({ quantity: 2, reason: 'Entrada' })).toEqual({
        quantity: 2,
        reason: 'Entrada',
      });
      expect(
        inventoryAdjustmentRequestSchema.parse({
          kind: 'drink',
          productId: 8,
          delta: -1,
          reason: 'Merma',
        }),
      ).toEqual({ kind: 'drink', productId: 8, delta: -1, reason: 'Merma' });
      expect(
        inventoryAdjustmentRequestSchema.parse({
          kind: 'leg',
          productId: null,
          delta: 3,
          reason: 'Conteo',
        }),
      ).toMatchObject({ kind: 'leg', productId: null, delta: 3 });
      expect(inventoryQuerySchema.parse({ afterId: 12 })).toEqual({ afterId: 12 });
      expect(inventoryQuerySchema.parse({})).toEqual({});
    });

    it.each([
      [{ enabled: true, reason: 'ok', extra: 1 }],
      [{ chickens: 1.2, reason: 'ok' }],
      [{ chickens: 10_001, reason: 'ok' }],
      [{ quantity: 100_001, reason: 'ok' }],
      [{ quantity: 1, reason: '   ' }],
      [{ kind: 'drink', productId: null, delta: 1, reason: 'ok' }],
      [{ kind: 'breast', productId: 8, delta: 1, reason: 'ok' }],
      [{ kind: 'leg', productId: null, delta: 0, reason: 'ok' }],
      [{ kind: 'drink', productId: 8, delta: 1.5, reason: 'ok' }],
      [{ kind: 'drink', productId: 0, delta: 1, reason: 'ok' }],
      [{ afterId: '12' }],
      [{ afterId: 0 }],
      [{ afterId: 2, extra: true }],
    ])('rejects malformed or non-strict request %j', (input) => {
      const schema =
        'chickens' in input
          ? inventoryBatchRequestSchema
          : 'quantity' in input
            ? inventoryReceiptRequestSchema
            : 'kind' in input
              ? inventoryAdjustmentRequestSchema
              : 'afterId' in input
                ? inventoryQuerySchema
                : inventoryControlRequestSchema;
      expect(schema.safeParse(input).success).toBe(false);
    });

    it('accepts documented range edges for receipt and adjustment bodies', () => {
      expect(
        inventoryReceiptRequestSchema.safeParse({ quantity: INVENTORY_RECEIPT_MAX, reason: 'ok' })
          .success,
      ).toBe(true);
      expect(
        inventoryAdjustmentRequestSchema.safeParse({
          kind: 'breast',
          productId: null,
          delta: -INVENTORY_ADJUSTMENT_MAX,
          reason: 'ok',
        }).success,
      ).toBe(true);
    });

    it('validates strict snapshots and preserves the response shape', () => {
      expect(inventorySnapshotSchema.parse(validSnapshot)).toEqual(validSnapshot);
      expect(inventorySnapshotSchema.safeParse({ ...validSnapshot, debug: true }).success).toBe(
        false,
      );
      expect(
        inventorySnapshotSchema.safeParse({
          ...validSnapshot,
          chicken: { ...validSnapshot.chicken, legEighths: -1 },
        }).success,
      ).toBe(false);
      expect(
        inventorySnapshotSchema.safeParse({ ...validSnapshot, generatedAt: 'yesterday' }).success,
      ).toBe(false);
    });

    it('validates movement invariants and strict mutation/page responses', () => {
      expect(inventoryMovementSchema.parse(validMovement)).toEqual(validMovement);
      expect(
        inventoryMovementSchema.safeParse({
          ...validMovement,
          kind: 'leg',
          type: 'batch',
          delta: -4,
        }).success,
      ).toBe(false);
      expect(
        inventoryMovementSchema.safeParse({
          ...validMovement,
          kind: 'breast',
          type: 'receipt',
          delta: 4,
        }).success,
      ).toBe(false);
      expect(
        inventoryMovementSchema.safeParse({
          ...validMovement,
          kind: 'drink',
          productId: 8,
          productName: 'Inca Kola',
          type: 'receipt',
          delta: 4,
        }).success,
      ).toBe(true);
      expect(
        inventoryMovementSchema.safeParse({
          ...validMovement,
          kind: 'drink',
          productId: 8,
          productName: 'Inca Kola',
          type: 'consumption',
          delta: -2,
          ticketId: 15,
        }).success,
      ).toBe(true);
      expect(
        inventoryMovementSchema.safeParse({
          ...validMovement,
          kind: 'drink',
          productId: 8,
          productName: 'Inca Kola',
          type: 'consumption',
          delta: 2,
          ticketId: 15,
        }).success,
      ).toBe(false);
      expect(
        inventoryMovementSchema.safeParse({
          ...validMovement,
          type: 'control',
          delta: 0,
          enabledAfter: true,
        }).success,
      ).toBe(true);
      expect(
        inventoryMovementSchema.safeParse({
          ...validMovement,
          type: 'control',
          delta: 0,
          enabledAfter: null,
        }).success,
      ).toBe(false);
      expect(inventoryMovementSchema.safeParse({ ...validMovement, kind: 'drink' }).success).toBe(
        false,
      );
      expect(inventoryMovementSchema.safeParse({ ...validMovement, ticketId: 2 }).success).toBe(
        false,
      );
      expect(
        inventoryMovementSchema.safeParse({ ...validMovement, unexpected: true }).success,
      ).toBe(false);
      expect(
        inventoryMutationResponseSchema.safeParse({
          inventory: validSnapshot,
          movements: [validMovement],
        }).success,
      ).toBe(true);
      expect(
        inventoryMutationResponseSchema.safeParse({
          inventory: validSnapshot,
          movements: [],
          extra: true,
        }).success,
      ).toBe(false);
      expect(
        inventoryMovementsResponseSchema.safeParse({
          movements: [validMovement],
          nextAfterId: null,
        }).success,
      ).toBe(true);
      expect(
        inventoryMovementsResponseSchema.safeParse({ movements: [], nextAfterId: 0 }).success,
      ).toBe(false);
    });
  });

  describe('AC-04: exact demand, combo multipliers and aggregation', () => {
    it('uses resolved direct chicken eighths once even when line quantity is greater than one', () => {
      expect(calculateInventoryDemand([chicken(11, 6, 2, 3)])).toEqual({
        breastEighths: 6,
        legEighths: 2,
        drinks: [],
        undefinedChickenProductIds: [],
      });
    });

    it('accepts resolved direct chicken at the maximum without multiplying line quantity again', () => {
      expect(calculateInventoryDemand([chicken(11, INVENTORY_QUANTITY_MAX, 0, 2)])).toEqual({
        breastEighths: INVENTORY_QUANTITY_MAX,
        legEighths: 0,
        drinks: [],
        undefinedChickenProductIds: [],
      });
    });

    it('multiplies combo component demand by combo quantity without adding parent totals', () => {
      const items: InventoryConsumptionItem[] = [
        {
          productId: 40,
          category: 'combo',
          quantity: 3,
          breastEighths: 99,
          legEighths: 99,
          components: [
            { productId: 11, category: 'chicken', quantity: 2, breastEighths: 2, legEighths: 0 },
            { productId: 8, category: 'drink', quantity: 1, breastEighths: 0, legEighths: 0 },
          ],
        },
      ];
      expect(calculateInventoryDemand(items)).toEqual({
        breastEighths: 6,
        legEighths: 0,
        drinks: [{ productId: 8, quantity: 3 }],
        undefinedChickenProductIds: [],
      });
    });

    it('aggregates repeated drinks across direct lines and multiple combo recipes in sorted unique resources', () => {
      const items: InventoryConsumptionItem[] = [
        {
          productId: 30,
          category: 'combo',
          quantity: 2,
          breastEighths: 0,
          legEighths: 0,
          components: [
            { productId: 9, category: 'drink', quantity: 3, breastEighths: 0, legEighths: 0 },
            { productId: 5, category: 'drink', quantity: 1, breastEighths: 0, legEighths: 0 },
          ],
        },
        {
          productId: 9,
          category: 'drink',
          quantity: 4,
          breastEighths: 0,
          legEighths: 0,
          components: [],
        },
        {
          productId: 31,
          category: 'combo',
          quantity: 1,
          breastEighths: 0,
          legEighths: 0,
          components: [
            { productId: 9, category: 'drink', quantity: 2, breastEighths: 0, legEighths: 0 },
          ],
        },
      ];
      expect(calculateInventoryDemand(items)).toEqual({
        breastEighths: 0,
        legEighths: 0,
        drinks: [
          { productId: 5, quantity: 2 },
          { productId: 9, quantity: 12 },
        ],
        undefinedChickenProductIds: [],
      });
    });

    it('reports unique sorted chicken ids whose resolved consumption is undefined', () => {
      const items: InventoryConsumptionItem[] = [
        chicken(19, 0, 0),
        chicken(7, 0, 0),
        chicken(19, 0, 0),
      ];
      expect(calculateInventoryDemand(items).undefinedChickenProductIds).toEqual([7, 19]);
    });

    it.each([
      [chicken(1, -1, 0)],
      [chicken(1, 0.5, 0)],
      [chicken(1, 0, 0, 0)],
      [{ ...chicken(1, 0, 0), productId: 0 }],
      [{ ...chicken(1, 0, 0), quantity: 1.1 }],
      [chicken(1, INVENTORY_QUANTITY_MAX, 0), chicken(2, 1, 0)],
      [
        {
          ...chicken(1, 0, 0),
          components: [
            {
              productId: 2,
              category: 'drink' as const,
              quantity: INVENTORY_QUANTITY_MAX,
              breastEighths: 0,
              legEighths: 0,
            },
          ],
        },
        {
          ...chicken(2, 0, 0),
          category: 'combo',
          quantity: 2,
          components: [
            {
              productId: 2,
              category: 'drink' as const,
              quantity: INVENTORY_QUANTITY_MAX,
              breastEighths: 0,
              legEighths: 0,
            },
          ],
        },
      ],
    ])('rejects invalid, negative, fractional or overflowing demand', (...items) => {
      expect(() => calculateInventoryDemand(items as InventoryConsumptionItem[])).toThrow(
        RangeError,
      );
    });

    it('does not mutate caller items, components, or their arrays', () => {
      const items: InventoryConsumptionItem[] = [
        {
          productId: 30,
          category: 'combo',
          quantity: 2,
          breastEighths: 0,
          legEighths: 0,
          components: [
            { productId: 8, category: 'drink', quantity: 2, breastEighths: 0, legEighths: 0 },
          ],
        },
      ];
      const before: InventoryConsumptionItem[] = items.map((item) => ({
        ...item,
        components: item.components?.map((component) => ({ ...component })) ?? null,
      }));
      calculateInventoryDemand(items);
      expect(items).toEqual(before);
    });
  });

  describe('AC-03 and AC-09: drink balances and permanent date-independent demand', () => {
    it('keeps repeated demand arithmetic stable across calendar boundaries without a date input', () => {
      const items = [
        chicken(11, 2, 0),
        {
          productId: 8,
          category: 'drink' as const,
          quantity: 3,
          breastEighths: 0,
          legEighths: 0,
          components: [],
        },
      ];
      const beforeMidnight = calculateInventoryDemand(items);
      const afterMidnight = calculateInventoryDemand(items);
      expect(afterMidnight).toEqual(beforeMidnight);
      expect(afterMidnight.drinks).toEqual([{ productId: 8, quantity: 3 }]);
    });
  });
});
