import { z } from 'zod';
import { productCategorySchema } from './products.ts';

export const INVENTORY_QUANTITY_MAX = 2_147_483_647;
export const INVENTORY_CHICKENS_MAX = 10_000;
export const INVENTORY_RECEIPT_MAX = 100_000;
export const INVENTORY_ADJUSTMENT_MAX = 100_000;

export const INVENTORY_KINDS = ['breast', 'leg', 'drink'] as const;
export const inventoryKindSchema = z.enum(INVENTORY_KINDS);
export type InventoryKind = z.infer<typeof inventoryKindSchema>;

const inventoryQuantitySchema = z.number().int().min(0).max(INVENTORY_QUANTITY_MAX);
const inventoryPositiveIdSchema = z.number().int().positive().max(INVENTORY_QUANTITY_MAX);
const reasonSchema = z.string().trim().min(1).max(200);

export const inventoryControlRequestSchema = z.strictObject({
  enabled: z.boolean(),
  reason: reasonSchema,
});
export type InventoryControlRequest = z.infer<typeof inventoryControlRequestSchema>;

export const inventoryBatchRequestSchema = z.strictObject({
  chickens: z.number().int().min(1).max(INVENTORY_CHICKENS_MAX),
  reason: reasonSchema,
});
export type InventoryBatchRequest = z.infer<typeof inventoryBatchRequestSchema>;

export const inventoryReceiptRequestSchema = z.strictObject({
  quantity: z.number().int().min(1).max(INVENTORY_RECEIPT_MAX),
  reason: reasonSchema,
});
export type InventoryReceiptRequest = z.infer<typeof inventoryReceiptRequestSchema>;

export const inventoryAdjustmentRequestSchema = z
  .strictObject({
    kind: inventoryKindSchema,
    productId: z.number().int().positive().max(INVENTORY_QUANTITY_MAX).nullable(),
    delta: z
      .number()
      .int()
      .min(-INVENTORY_ADJUSTMENT_MAX)
      .max(INVENTORY_ADJUSTMENT_MAX)
      .refine((n) => n !== 0),
    reason: reasonSchema,
  })
  .refine(({ kind, productId }) => (kind === 'drink') === (productId !== null));
export type InventoryAdjustmentRequest = z.infer<typeof inventoryAdjustmentRequestSchema>;

export const inventoryQuerySchema = z.strictObject({
  afterId: z.number().int().positive().max(INVENTORY_QUANTITY_MAX).optional(),
});
export type InventoryQuery = z.infer<typeof inventoryQuerySchema>;

const isoUtcSchema = z.iso.datetime({ offset: false }).refine((value) => value.endsWith('Z'));

export const inventorySnapshotSchema = z.strictObject({
  chicken: z.strictObject({
    enabled: z.boolean(),
    breastEighths: inventoryQuantitySchema,
    legEighths: inventoryQuantitySchema,
  }),
  drinks: z.array(
    z.strictObject({
      productId: inventoryPositiveIdSchema,
      productName: z.string().min(1),
      enabled: z.boolean(),
      quantity: inventoryQuantitySchema,
    }),
  ),
  generatedAt: isoUtcSchema,
});
export type InventorySnapshot = z.infer<typeof inventorySnapshotSchema>;

export const INVENTORY_MOVEMENT_TYPES = [
  'batch',
  'receipt',
  'adjustment',
  'consumption',
  'control',
] as const;
export const inventoryMovementSchema = z
  .strictObject({
    id: inventoryPositiveIdSchema,
    kind: inventoryKindSchema,
    productId: inventoryPositiveIdSchema.nullable(),
    productName: z.string().min(1).nullable(),
    type: z.enum(INVENTORY_MOVEMENT_TYPES),
    delta: z.number().int().min(-INVENTORY_QUANTITY_MAX).max(INVENTORY_QUANTITY_MAX),
    quantityAfter: inventoryQuantitySchema,
    enabledAfter: z.boolean().nullable(),
    reason: reasonSchema,
    actor: z.strictObject({ id: inventoryPositiveIdSchema, displayName: z.string().min(1) }),
    ticketId: inventoryPositiveIdSchema.nullable(),
    createdAt: isoUtcSchema,
  })
  .refine((m) => {
    if ((m.kind === 'drink') !== (m.productId !== null && m.productName !== null)) return false;
    if ((m.productId === null) !== (m.productName === null)) return false;
    if (m.type === 'control')
      return m.delta === 0 && m.enabledAfter !== null && m.ticketId === null;
    if (m.delta === 0 || m.enabledAfter !== null) return false;
    if (m.type === 'batch')
      return (m.kind === 'breast' || m.kind === 'leg') && m.delta > 0 && m.ticketId === null;
    if (m.type === 'receipt') return m.kind === 'drink' && m.delta > 0 && m.ticketId === null;
    if (m.type === 'consumption') return m.delta < 0 && m.ticketId !== null;
    return m.type === 'adjustment' && m.ticketId === null;
  });
export type InventoryMovement = z.infer<typeof inventoryMovementSchema>;

export const inventoryMutationResponseSchema = z.strictObject({
  inventory: inventorySnapshotSchema,
  movements: z.array(inventoryMovementSchema),
});
export type InventoryMutationResponse = z.infer<typeof inventoryMutationResponseSchema>;

export const inventoryMovementsResponseSchema = z.strictObject({
  movements: z.array(inventoryMovementSchema),
  nextAfterId: inventoryPositiveIdSchema.nullable(),
});
export type InventoryMovementsResponse = z.infer<typeof inventoryMovementsResponseSchema>;

export type InventoryConsumptionComponent = {
  productId: number;
  category: z.infer<typeof productCategorySchema>;
  quantity: number;
  breastEighths: number;
  legEighths: number;
};
export type InventoryConsumptionItem = InventoryConsumptionComponent & {
  components: readonly InventoryConsumptionComponent[];
};
export type InventoryDemand = {
  breastEighths: number;
  legEighths: number;
  drinks: { productId: number; quantity: number }[];
  undefinedChickenProductIds: number[];
};

function assertSafeNonnegativeInteger(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > INVENTORY_QUANTITY_MAX) {
    throw new RangeError('Inventory quantity is outside the supported range.');
  }
}

function assertPositiveId(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0 || value > INVENTORY_QUANTITY_MAX) {
    throw new RangeError('Inventory product id is outside the supported range.');
  }
}

function safeAdd(left: number, right: number): number {
  const result = left + right;
  assertSafeNonnegativeInteger(result);
  return result;
}

function safeMultiply(left: number, right: number): number {
  const result = left * right;
  assertSafeNonnegativeInteger(result);
  return result;
}

export function chickenBatchEighths(chickens: number): {
  breastEighths: number;
  legEighths: number;
} {
  if (!Number.isSafeInteger(chickens) || chickens < 1 || chickens > INVENTORY_CHICKENS_MAX) {
    throw new RangeError('Chicken batch size is outside the supported range.');
  }
  return { breastEighths: chickens * 4, legEighths: chickens * 4 };
}

export function applyInventoryDelta(quantity: number, delta: number): number {
  assertSafeNonnegativeInteger(quantity);
  if (!Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > INVENTORY_QUANTITY_MAX) {
    throw new RangeError('Inventory delta is outside the supported range.');
  }
  const result = quantity + delta;
  assertSafeNonnegativeInteger(result);
  return result;
}

export function calculateInventoryDemand(
  items: readonly InventoryConsumptionItem[],
): InventoryDemand {
  let breastEighths = 0;
  let legEighths = 0;
  const drinks = new Map<number, number>();
  const undefinedChickenProductIds = new Set<number>();

  const validate = (item: InventoryConsumptionComponent): void => {
    assertPositiveId(item.productId);
    if (
      !Number.isSafeInteger(item.quantity) ||
      item.quantity <= 0 ||
      item.quantity > INVENTORY_QUANTITY_MAX
    ) {
      throw new RangeError('Inventory demand quantity is outside the supported range.');
    }
    assertSafeNonnegativeInteger(item.breastEighths);
    assertSafeNonnegativeInteger(item.legEighths);
  };

  for (const item of items) {
    validate(item);
    if (item.category === 'chicken') {
      if (item.breastEighths === 0 && item.legEighths === 0)
        undefinedChickenProductIds.add(item.productId);
      breastEighths = safeAdd(breastEighths, item.breastEighths);
      legEighths = safeAdd(legEighths, item.legEighths);
    } else if (item.category === 'drink') {
      drinks.set(item.productId, safeAdd(drinks.get(item.productId) ?? 0, item.quantity));
    }

    if (item.category === 'combo') {
      for (const component of item.components) {
        validate(component);
        if (component.category === 'chicken') {
          if (component.breastEighths === 0 && component.legEighths === 0) {
            undefinedChickenProductIds.add(component.productId);
          }
          breastEighths = safeAdd(
            breastEighths,
            safeMultiply(component.breastEighths, item.quantity),
          );
          legEighths = safeAdd(legEighths, safeMultiply(component.legEighths, item.quantity));
        } else if (component.category === 'drink') {
          const amount = safeMultiply(component.quantity, item.quantity);
          drinks.set(component.productId, safeAdd(drinks.get(component.productId) ?? 0, amount));
        }
      }
    }
  }

  return {
    breastEighths,
    legEighths,
    drinks: [...drinks]
      .sort(([a], [b]) => a - b)
      .map(([productId, quantity]) => ({ productId, quantity })),
    undefinedChickenProductIds: [...undefinedChickenProductIds].sort((a, b) => a - b),
  };
}
