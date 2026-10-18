import { calculateInventoryDemand, chickenConsumption } from '@polleria/shared';
import type {
  InventoryDemand,
  InventoryKind,
  InventorySnapshot,
  MenuProduct,
  Portion,
  Cut,
} from '@polleria/shared';

export interface InventoryCartLineInput {
  productId: number;
  quantity: number;
  portion: Portion | null;
  cut: Cut | null;
  breastEighths: number;
  legEighths: number;
  components: readonly {
    productId: number;
    quantity: number;
    portion?: Portion;
    cut?: Cut;
    breastEighths?: number;
    legEighths?: number;
  }[] | null;
}

function missingProduct(productId: number): never {
  throw new RangeError(`Inventory demand cannot be resolved for product ${productId}.`);
}

function portionDemand(portion: Portion | null, cut: Cut | null): {
  breastEighths: number;
  legEighths: number;
} {
  if (portion === null) return { breastEighths: 0, legEighths: 0 };
  return chickenConsumption(portion, cut);
}

export function calculateCartInventoryDemand(
  products: readonly MenuProduct[],
  lines: readonly InventoryCartLineInput[],
): InventoryDemand {
  const productsById = new Map<number, { id: number; category: MenuProduct['category'] }>();
  const comboRowsByProduct = new Map<number, MenuProduct['items']>();
  for (const product of products) {
    productsById.set(product.id, { id: product.id, category: product.category });
    for (const item of product.items) {
      productsById.set(item.product.id, { id: item.product.id, category: item.product.category });
    }
  }
  for (const product of products) comboRowsByProduct.set(product.id, product.items);

  return calculateInventoryDemand(
    lines.map((line) => {
      const product = productsById.get(line.productId) ?? missingProduct(line.productId);
      if (product.category !== 'combo') {
        const perUnit = product.category === 'chicken'
          ? line.portion === 'half'
            ? { breastEighths: line.breastEighths, legEighths: line.legEighths }
            : portionDemand(line.portion, line.cut)
          : { breastEighths: 0, legEighths: 0 };
        return {
          productId: product.id,
          category: product.category,
          quantity: line.quantity,
          // CartLine holds editor octaves per unit; shared expects direct chicken
          // octaves with the line quantity already applied.
          breastEighths: perUnit.breastEighths * line.quantity,
          legEighths: perUnit.legEighths * line.quantity,
          components: [],
        };
      }

      const recipe = comboRowsByProduct.get(product.id) ?? missingProduct(product.id);
      const selectedComponents = line.components;
      const recipeComponents: NonNullable<InventoryCartLineInput['components']> = recipe.map((row) => ({
        productId: row.product.id,
        quantity: row.quantity,
        ...(row.portion === null ? {} : { portion: row.portion }),
        ...(row.cut === null ? {} : { cut: row.cut }),
      }));
      const components = (selectedComponents ?? recipeComponents).map((selected) => {
        const row = recipe.find((item) => item.product.id === selected.productId);
        const componentProduct = productsById.get(selected.productId) ?? missingProduct(selected.productId);
        if (row === undefined) missingProduct(selected.productId);

        if (componentProduct.category === 'chicken') {
          const consumption = selected.breastEighths !== undefined && selected.legEighths !== undefined
            ? { breastEighths: selected.breastEighths, legEighths: selected.legEighths }
            : portionDemand(selected.portion ?? row.portion, selected.cut ?? row.cut);
          // Shared expects recipe component octaves to include the recipe quantity;
          // it applies the outer combo quantity once.
          return {
            productId: componentProduct.id,
            category: componentProduct.category,
            quantity: selected.quantity,
            breastEighths: consumption.breastEighths * selected.quantity,
            legEighths: consumption.legEighths * selected.quantity,
          };
        }
        return {
          productId: componentProduct.id,
          category: componentProduct.category,
          quantity: selected.quantity,
          breastEighths: 0,
          legEighths: 0,
        };
      });

      return {
        productId: product.id,
        category: product.category,
        quantity: line.quantity,
        // Combo parent octaves are deliberately ignored by shared demand calculation.
        breastEighths: 0,
        legEighths: 0,
        components,
      };
    }),
  );
}

export interface InventoryShortage {
  kind: InventoryKind;
  productId: number | null;
  available: number;
  required: number;
}

export function inventoryShortages(
  snapshot: InventorySnapshot,
  demand: InventoryDemand,
): InventoryShortage[] {
  const shortages: InventoryShortage[] = [];
  if (snapshot.chicken.enabled) {
    if (demand.breastEighths > snapshot.chicken.breastEighths) {
      shortages.push({
        kind: 'breast', productId: null,
        available: snapshot.chicken.breastEighths, required: demand.breastEighths,
      });
    }
    if (demand.legEighths > snapshot.chicken.legEighths) {
      shortages.push({
        kind: 'leg', productId: null,
        available: snapshot.chicken.legEighths, required: demand.legEighths,
      });
    }
  }
  const drinks = new Map(snapshot.drinks.map((drink) => [drink.productId, drink]));
  for (const required of demand.drinks) {
    const drink = drinks.get(required.productId);
    if (drink === undefined) missingProduct(required.productId);
    if (drink.enabled && required.quantity > drink.quantity) {
      shortages.push({
        kind: 'drink', productId: required.productId,
        available: drink.quantity, required: required.quantity,
      });
    }
  }
  return shortages;
}
