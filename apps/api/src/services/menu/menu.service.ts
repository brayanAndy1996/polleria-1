import { Op } from 'sequelize';
import { PORTIONS } from '@polleria/shared';
import type {
  MenuComboItem,
  MenuPortion,
  MenuProduct,
  MenuResponse,
  Product,
} from '@polleria/shared';
import type { Models, ProductModel } from '../../models/index.ts';

export interface MenuService {
  listMenu(): Promise<MenuResponse>;
}

/** Orden de la parte dentro de una misma presentación: pecho antes que pierna (D-006-11). */
const CUT_ORDER = { breast: 0, leg: 1 } as const;

/** El producto embebido en un componente de combo: las cinco claves de la 005. */
function toProduct(row: ProductModel): Product {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    priceCents: row.priceCents,
    isActive: row.isActive,
  };
}

/**
 * La carta completa para armar pedidos (spec 010, D-010-14 y AC-14): solo
 * productos activos, ordenados por categoría (el orden de PRODUCT_CATEGORIES:
 * pollos, combos, platos, bebidas, postres, cremas, extras) y dentro de cada una
 * por nombre alfabético en español — el collator 'es' con sensibilidad base,
 * desempatado por id. Cada producto lleva sus presentaciones (los pollos, en el
 * orden de PORTIONS y pecho antes que pierna) y sus componentes (los combos, en
 * orden de configuración) con el producto componente embebido.
 */
export function createMenuService({ models }: { models: Models }): MenuService {
  const collator = new Intl.Collator('es', { sensitivity: 'base' });

  return {
    async listMenu() {
      const products = await models.Product.findAll({
        where: { isActive: true },
        order: [['id', 'ASC']],
      });
      const productIds = products.map((product) => product.id);
      const [portionRows, comboItemRows] = await Promise.all([
        models.ProductPortion.findAll({ where: { productId: { [Op.in]: productIds } } }),
        models.ComboItem.findAll({
          where: { comboId: { [Op.in]: productIds } },
          order: [['id', 'ASC']],
        }),
      ]);
      const componentIds = [...new Set(comboItemRows.map((row) => row.productId))];
      const componentProducts =
        componentIds.length === 0
          ? []
          : await models.Product.findAll({ where: { id: { [Op.in]: componentIds } } });
      const componentById = new Map<number, ProductModel>(
        componentProducts.map((product) => [product.id, product]),
      );

      const portionsByProduct = new Map<number, MenuPortion[]>();
      for (const row of [...portionRows].sort(
        (first, second) =>
          PORTIONS.indexOf(first.portion) - PORTIONS.indexOf(second.portion) ||
          (first.cut === null ? 1 : CUT_ORDER[first.cut]) -
            (second.cut === null ? 1 : CUT_ORDER[second.cut]) ||
          first.id - second.id,
      )) {
        const list = portionsByProduct.get(row.productId) ?? [];
        list.push({ portion: row.portion, cut: row.cut, priceCents: row.priceCents });
        portionsByProduct.set(row.productId, list);
      }
      const itemsByCombo = new Map<number, MenuComboItem[]>();
      for (const row of comboItemRows) {
        const component = componentById.get(row.productId);
        if (component === undefined) continue;
        const list = itemsByCombo.get(row.comboId) ?? [];
        list.push({
          product: toProduct(component),
          quantity: row.quantity,
          portion: row.portion,
          cut: row.cut,
        });
        itemsByCombo.set(row.comboId, list);
      }

      const categoryRank = new Map(
        (['chicken', 'combo', 'dish', 'drink', 'dessert', 'sauce', 'extra'] as const).map(
          (category, rank) => [category, rank],
        ),
      );
      const ordered = [...products].sort(
        (first, second) =>
          (categoryRank.get(first.category) ?? 99) - (categoryRank.get(second.category) ?? 99) ||
          collator.compare(first.name, second.name) ||
          first.id - second.id,
      );
      const menu: MenuProduct[] = ordered.map((product) => ({
        id: product.id,
        name: product.name,
        category: product.category,
        priceCents: product.priceCents,
        portions: portionsByProduct.get(product.id) ?? [],
        items: itemsByCombo.get(product.id) ?? [],
      }));
      return { products: menu };
    },
  };
}
