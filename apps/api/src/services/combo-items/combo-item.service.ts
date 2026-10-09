import { ForeignKeyConstraintError, Op, Transaction } from 'sequelize';
import { PRODUCT_CATEGORIES, replaceComboItemsRequestSchema } from '@polleria/shared';
import type { ComboItem, Product } from '@polleria/shared';
import { AppError } from '../../errors/app-error.ts';
import type { ComboItemAttributes, Models, ProductAttributes } from '../../models/index.ts';
import { createProductNotFoundError } from '../products/product.service.ts';

export interface ComboItemService {
  listComboItems(productId: number): Promise<ComboItem[]>;
  replaceComboItems(productId: number, input: unknown): Promise<ComboItem[]>;
}

export function createComboItemsNotAllowedError(): AppError {
  return new AppError({
    code: 'COMBO_ITEMS_NOT_ALLOWED',
    message: 'Solo los productos de la categoría Combos pueden tener componentes.',
    httpStatus: 409,
  });
}
export function createProductHasItemsError(): AppError {
  return new AppError({
    code: 'PRODUCT_HAS_ITEMS',
    message:
      'Este producto es un combo con componentes; quita sus componentes antes de ' +
      'cambiar su categoría.',
    httpStatus: 409,
  });
}
export function createProductIsComponentError(): AppError {
  return new AppError({
    code: 'PRODUCT_IS_COMPONENT',
    message:
      'Este producto es componente de un combo; quítalo del combo antes de ' +
      'cambiar su categoría.',
    httpStatus: 409,
  });
}

// Mensajes de los cuatro issues de componente (D-007-10), por path items.N.*.
const COMPONENT_NOT_FOUND_MESSAGE = 'Ese producto no existe.';
const NESTED_COMBO_MESSAGE = 'Un combo no puede ser componente de otro combo.';
const CHICKEN_NEEDS_PORTION_MESSAGE =
  'El pollo de un combo lleva presentación (eighth, quarter, half o whole).';
const ONLY_CHICKEN_HAS_PORTION_MESSAGE = 'Solo un componente de pollo lleva presentación y parte.';

/**
 * La API expone exactamente las seis claves de ComboItem (D-007-09): el producto
 * componente embebido con sus cinco claves de la 005 leídas al momento —el GET muestra
 * el nombre y el precio actuales, y un componente desactivado sale con isActive
 * false—; nunca createdAt, updatedAt ni los nombres en snake_case de las columnas.
 */
function toComboItem(
  row: {
    id: number;
    comboId: number;
    quantity: number;
    portion: ComboItem['portion'];
    cut: ComboItem['cut'];
  },
  component: {
    id: number;
    name: string;
    category: Product['category'];
    priceCents: number;
    isActive: boolean;
  },
): ComboItem {
  const { id, comboId, quantity, portion, cut } = row;
  const { id: productId, name, category, priceCents, isActive } = component;
  return {
    id,
    comboId,
    product: { id: productId, name, category, priceCents, isActive },
    quantity,
    portion,
    cut,
  };
}

/** Una fila de combo_items con su componente precargado por el alias 'product'. */
type ComboItemWithProduct = ComboItemAttributes & { product: ProductAttributes };

/**
 * Servicio de componentes de combo (spec 007). listComboItems es de lectura para
 * cualquier rol con sesión (RN-007-01); replaceComboItems es la lista completa que el
 * admin guarda de una vez (D-007-06): reemplazo atómico dentro de una transacción con
 * la serialización aprendida en la 006 — los id de las filas pueden cambiar entre un
 * PUT y otro.
 */
export function createComboItemService({ models }: { models: Models }): ComboItemService {
  const sequelize = models.ComboItem.sequelize;
  if (sequelize === undefined)
    throw new Error('Los modelos no están vinculados a una conexión de Sequelize.');

  // Orden de la lista (D-007-09): categoría del componente en el orden de la carta
  // (PRODUCT_CATEGORIES), nombre en español sin distinguir mayúsculas ni tildes (mismo
  // collator de listProducts) y empates por id del ítem.
  const collator = new Intl.Collator('es', { sensitivity: 'base' });

  /** Las filas del combo ya ordenadas (sin verificar que el producto exista). */
  async function listRows(comboId: number): Promise<ComboItem[]> {
    const rows = await models.ComboItem.findAll({
      where: { comboId },
      attributes: ['id', 'comboId', 'quantity', 'portion', 'cut'],
      include: [
        {
          model: models.Product,
          as: 'product',
          attributes: ['id', 'name', 'category', 'priceCents', 'isActive'],
        },
      ],
    });
    return rows
      .map((row) => {
        const { product } = row.get({ plain: true }) as ComboItemWithProduct;
        return toComboItem(row, product);
      })
      .sort(
        (first, second) =>
          PRODUCT_CATEGORIES.indexOf(first.product.category) -
            PRODUCT_CATEGORIES.indexOf(second.product.category) ||
          collator.compare(first.product.name, second.product.name) ||
          first.id - second.id,
      );
  }

  return {
    async listComboItems(productId) {
      const product = await models.Product.findByPk(productId, { attributes: ['id'] });
      if (product === null) throw createProductNotFoundError();
      // Un producto sin componentes (combo o de otra categoría) devuelve [].
      return listRows(productId);
    },
    async replaceComboItems(productId, input) {
      // Primero la entrada (ZodError), luego que el producto exista y sea 'combo'
      // (RN-007-03): lo que no permite el 409 es el estado del producto, no el cuerpo.
      const { items } = replaceComboItemsRequestSchema.parse(input);
      const product = await models.Product.findByPk(productId, {
        attributes: ['id', 'category'],
      });
      if (product === null) throw createProductNotFoundError();
      if (product.category !== 'combo') throw createComboItemsNotAllowedError();
      try {
        await sequelize.transaction(async (transaction) => {
          // Locks FOR NO KEY UPDATE de los productos referenciados, en orden ascendente
          // de id y ANTES de insertar (D-007-06): serializan contra un PATCH que cambie
          // la categoría de un componente — si el PATCH confirmó primero, el re-leído
          // ve la categoría nueva y el PUT rechaza; si el PUT bloqueó primero, el UPDATE
          // del PATCH espera al commit y su re-verificación posterior ve las filas
          // nuevas (PRODUCT_IS_COMPONENT). El orden ascendente evita deadlocks entre
          // PUTs con componentes compartidos. La lectura tras el lock trae la categoría
          // ya confirmada (READ COMMITTED relee la versión más reciente tras esperar).
          const componentIds = [...new Set(items.map((item) => item.productId))].sort(
            (a, b) => a - b,
          );
          const components = new Map<number, { category: Product['category'] } | null>();
          for (const componentId of componentIds) {
            components.set(
              componentId,
              await models.Product.findByPk(componentId, {
                attributes: ['id', 'category'],
                lock: Transaction.LOCK.NO_KEY_UPDATE,
                transaction,
              }),
            );
          }
          // Reglas de componente por ítem, acumuladas en el orden de la lista en un
          // solo 400 VALIDATION_ERROR (D-007-10). El producto inexistente omite las
          // demás reglas del ítem.
          const issues: { path: string; message: string }[] = [];
          items.forEach((item, index) => {
            const component = components.get(item.productId);
            if (component === null || component === undefined) {
              issues.push({
                path: `items.${index}.productId`,
                message: COMPONENT_NOT_FOUND_MESSAGE,
              });
              return;
            }
            // Un combo nunca es componente (RN-007-04): cubre también la
            // auto-referencia, porque el producto de la ruta ya es 'combo'.
            if (component.category === 'combo') {
              issues.push({
                path: `items.${index}.productId`,
                message: NESTED_COMBO_MESSAGE,
              });
              return;
            }
            if (component.category === 'chicken') {
              if (item.portion === null)
                issues.push({
                  path: `items.${index}.portion`,
                  message: CHICKEN_NEEDS_PORTION_MESSAGE,
                });
              return;
            }
            if (item.portion !== null || item.cut !== null)
              issues.push({
                path: `items.${index}.portion`,
                message: ONLY_CHICKEN_HAS_PORTION_MESSAGE,
              });
          });
          if (issues.length > 0)
            throw new AppError({
              code: 'VALIDATION_ERROR',
              message: 'Los datos enviados no son válidos.',
              httpStatus: 400,
              details: { issues },
            });
          // Reemplazo atómico (D-007-06): si algo falla, el conjunto anterior queda
          // intacto.
          await models.ComboItem.destroy({ where: { comboId: productId }, transaction });
          const created =
            items.length === 0
              ? []
              : await models.ComboItem.bulkCreate(
                  items.map(({ productId: componentId, quantity, portion, cut }) => ({
                    comboId: productId,
                    productId: componentId,
                    quantity,
                    portion,
                    cut,
                  })),
                  {
                    transaction,
                    // Dos PUT que confirman la misma clave (combo_id, product_id,
                    // portion, cut) no deben romperse: el último gana la cantidad con
                    // DO UPDATE — "gana el último en confirmar" (D-007-06).
                    updateOnDuplicate: ['quantity'],
                    conflictAttributes: ['comboId', 'productId', 'portion', 'cut'],
                  },
                );
          // Serialización por la fila del producto combo, DESPUÉS de insertar a
          // propósito: así un PATCH de categoría que corrió en el hueco ya confirmó y
          // su efecto es visible aquí (READ COMMITTED relee la versión más reciente
          // tras esperar el lock). Es FOR NO KEY UPDATE y no FOR UPDATE: el INSERT de
          // combo_items ya dejó un FOR KEY SHARE sobre esta fila (el disparador de la
          // FK hacia products) y FOR UPDATE chocaría con el FOR KEY SHARE que retiene
          // el otro PUT en vuelo — deadlock 40P01, la misma lección de la corrección
          // de la 006. Quien confirma segundo ve el estado del primero: si la
          // categoría dejó de ser 'combo' o la fila desapareció, esta transacción se
          // aborta y el conjunto propio se revierte.
          const locked = await models.Product.findByPk(productId, {
            attributes: ['id', 'category'],
            lock: Transaction.LOCK.NO_KEY_UPDATE,
            transaction,
          });
          if (locked === null) throw createProductNotFoundError();
          if (locked.category !== 'combo') throw createComboItemsNotAllowedError();
          // Filas confirmadas por otro PUT que corrió en el hueco (antes de que esta
          // transacción tomara el lock): el que confirma último gana — se borra todo lo
          // que no sea mío. Con un conjunto vacío se borra todo, igual que pide
          // PUT {items: []}.
          const keepIds = created.map((row) => row.id);
          await models.ComboItem.destroy({
            where:
              keepIds.length > 0
                ? { comboId: productId, id: { [Op.notIn]: keepIds } }
                : { comboId: productId },
            transaction,
          });
        });
      } catch (error) {
        // Si la fila del combo desapareció entre la lectura inicial y el INSERT (hoy
        // solo posible por SQL directo — la API nunca borra productos, RN-005-04), el
        // bulkCreate cae en la FK con un error crudo de Sequelize que sería 500 con
        // log. Se relee la existencia del producto y se traduce al 404 de dominio,
        // igual que la corrección ADV-005-25 en updateProduct.
        if (
          error instanceof ForeignKeyConstraintError &&
          (await models.Product.findByPk(productId, { attributes: ['id'] })) === null
        )
          throw createProductNotFoundError();
        throw error;
      }
      return listRows(productId);
    },
  };
}
