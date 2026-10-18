import type { InventorySnapshot, MenuProduct } from '@polleria/shared';
import { describe, expect, it } from 'vitest';
import { calculateCartInventoryDemand, inventoryShortages } from './inventory-demand.ts';

function product(value: Record<string, unknown>): MenuProduct {
  return value as unknown as MenuProduct;
}

describe('015: demanda del carrito contra la carta servida', () => {
  it('AC-14: suma pollo directo, receta de combos y bebidas repetidas sin doble contar al padre', () => {
    const chicken = product({
      id: 1,
      name: 'Pollo',
      category: 'chicken',
      priceCents: 4000,
      portions: [],
      items: [],
    });
    const drink = product({
      id: 8,
      name: 'Gaseosa',
      category: 'drink',
      priceCents: 500,
      portions: [],
      items: [],
    });
    const combo = product({
      id: 2,
      name: 'Combo',
      category: 'combo',
      priceCents: 2500,
      portions: [],
      items: [
        { product: chicken, quantity: 2, portion: 'quarter', cut: 'leg' },
        { product: drink, quantity: 2, portion: null, cut: null },
      ],
    });
    const demand = calculateCartInventoryDemand(
      [chicken, drink, combo],
      [
        {
          productId: 1,
          quantity: 2,
          portion: 'half',
          cut: null,
          breastEighths: 1,
          legEighths: 3,
          components: null,
        },
        {
          productId: 2,
          quantity: 3,
          portion: null,
          cut: null,
          breastEighths: 0,
          legEighths: 0,
          components: null,
        },
        {
          productId: 8,
          quantity: 2,
          portion: null,
          cut: null,
          breastEighths: 0,
          legEighths: 0,
          components: null,
        },
      ],
    );
    expect(demand).toEqual({
      breastEighths: 2,
      legEighths: 18,
      drinks: [{ productId: 8, quantity: 8 }],
      undefinedChickenProductIds: [],
    });
  });

  it('AC-14: pollo directo sin porción queda marcado y no se infiere de nombres', () => {
    const undefinedChicken = product({
      id: 12,
      name: 'Pollo entero especial',
      category: 'chicken',
      priceCents: 3000,
      portions: [],
      items: [],
    });
    expect(
      calculateCartInventoryDemand(
        [undefinedChicken],
        [
          {
            productId: 12,
            quantity: 1,
            portion: null,
            cut: null,
            breastEighths: 0,
            legEighths: 0,
            components: null,
          },
        ],
      ),
    ).toEqual({
      breastEighths: 0,
      legEighths: 0,
      drinks: [],
      undefinedChickenProductIds: [12],
    });
  });

  it('AC-14: enumera faltantes concretos y conserva los recursos con saldo suficiente', () => {
    const snapshot: InventorySnapshot = {
      chicken: { enabled: true, breastEighths: 2, legEighths: 10 },
      drinks: [
        { productId: 8, productName: 'Gaseosa', enabled: true, quantity: 1 },
        { productId: 9, productName: 'Chicha', enabled: true, quantity: 7 },
      ],
      generatedAt: '2026-10-17T15:00:00.000Z',
    };
    expect(
      inventoryShortages(snapshot, {
        breastEighths: 3,
        legEighths: 4,
        drinks: [
          { productId: 8, quantity: 2 },
          { productId: 9, quantity: 5 },
        ],
        undefinedChickenProductIds: [],
      }),
    ).toEqual([
      { kind: 'breast', productId: null, available: 2, required: 3 },
      { kind: 'drink', productId: 8, available: 1, required: 2 },
    ]);
  });
});
