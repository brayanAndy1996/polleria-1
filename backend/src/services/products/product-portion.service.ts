import { ForeignKeyConstraintError, Op, Transaction } from 'sequelize';
import { CUTS, PORTIONS, replaceProductPortionsRequestSchema } from '@polleria/shared';
import type { ProductPortion } from '@polleria/shared';
import { AppError } from '../../errors/app-error.ts';
import type { Models } from '../../models/index.ts';
import { createProductNotFoundError } from './product.service.ts';

export interface ProductPortionService {
  listProductPortions(productId: number): Promise<ProductPortion[]>;
  replaceProductPortions(productId: number, input: unknown): Promise<ProductPortion[]>;
}

export function createPortionsNotAllowedError(): AppError {
  return new AppError({
    code: 'PORTIONS_NOT_ALLOWED',
    message: 'Solo los productos de la categoría Pollo pueden tener presentaciones.',
    httpStatus: 409,
  });
}
export function createProductHasPortionsError(): AppError {
  return new AppError({
    code: 'PRODUCT_HAS_PORTIONS',
    message: 'Este producto tiene presentaciones de pollo; quítalas antes de cambiar su categoría.',
    httpStatus: 409,
  });
}

/**
 * La API expone exactamente las cinco claves de ProductPortion (D-006-11): nunca
 * createdAt, updatedAt ni el nombre en snake_case de la columna.
 */
function toProductPortion(row: {
  id: number;
  productId: number;
  portion: ProductPortion['portion'];
  cut: ProductPortion['cut'];
  priceCents: number;
}): ProductPortion {
  const { id, productId, portion, cut, priceCents } = row;
  return { id, productId, portion, cut, priceCents };
}

/**
 * Orden de la lista de presentaciones (D-006-11): portion en el orden de PORTIONS
 * (eighth, quarter, half, whole), luego cut en el orden de CUTS (breast antes que leg)
 * y los empates por id. El orden visible queda: octavo pecho, octavo pierna, cuarto
 * pecho, cuarto pierna, medio, entero. Se ordena en memoria: son máximo
 * PRODUCT_PORTIONS_MAX filas por producto, igual que listProducts de la 005.
 */
function comparePortions(first: ProductPortion, second: ProductPortion): number {
  return (
    PORTIONS.indexOf(first.portion) - PORTIONS.indexOf(second.portion) ||
    (first.cut === null ? -1 : CUTS.indexOf(first.cut)) -
      (second.cut === null ? -1 : CUTS.indexOf(second.cut)) ||
    first.id - second.id
  );
}

/**
 * Servicio de presentaciones del pollo (spec 006). listProductPortions es de lectura
 * para cualquier rol con sesión (RN-006-02); replaceProductPortions es la grilla que el
 * admin guarda de una vez (D-006-06): borrado + inserción dentro de una transacción,
 * todo o nada — los id de las filas pueden cambiar entre un PUT y otro.
 */
export function createProductPortionService({ models }: { models: Models }): ProductPortionService {
  const sequelize = models.ProductPortion.sequelize;
  if (sequelize === undefined)
    throw new Error('Los modelos no están vinculados a una conexión de Sequelize.');

  /** Las filas del producto ya ordenadas (sin verificar que el producto exista). */
  async function listRows(productId: number): Promise<ProductPortion[]> {
    const rows = await models.ProductPortion.findAll({
      where: { productId },
      attributes: ['id', 'productId', 'portion', 'cut', 'priceCents'],
    });
    return rows.map((row) => toProductPortion(row)).sort(comparePortions);
  }

  return {
    async listProductPortions(productId) {
      const product = await models.Product.findByPk(productId, { attributes: ['id'] });
      if (product === null) throw createProductNotFoundError();
      // Un producto sin presentaciones (chicken o de otra categoría) devuelve [].
      return listRows(productId);
    },
    async replaceProductPortions(productId, input) {
      // Primero la entrada (ZodError), luego que el producto exista y sea 'chicken'
      // (RN-006-03): lo que no permite el 409 es el estado del producto, no el cuerpo.
      const { portions } = replaceProductPortionsRequestSchema.parse(input);
      const product = await models.Product.findByPk(productId, {
        attributes: ['id', 'category'],
      });
      if (product === null) throw createProductNotFoundError();
      if (product.category !== 'chicken') throw createPortionsNotAllowedError();
      try {
        await sequelize.transaction(async (transaction) => {
          // Reemplazo atómico (D-006-06): si algo falla, el conjunto anterior queda intacto.
          await models.ProductPortion.destroy({ where: { productId }, transaction });
          const created =
            portions.length === 0
              ? []
              : await models.ProductPortion.bulkCreate(
                  portions.map(({ portion, cut, priceCents }) => ({
                    productId,
                    portion,
                    // En half y whole el cut ausente y el null valen lo mismo: la fila queda NULL.
                    cut: cut ?? null,
                    priceCents,
                  })),
                  {
                    transaction,
                    // Dos PUT que confirman la misma clave (product_id, portion, cut) no
                    // deben romperse: el último gana el precio con DO UPDATE (RN y caso
                    // borde de la spec: "gana el último en confirmar").
                    updateOnDuplicate: ['priceCents'],
                    conflictAttributes: ['productId', 'portion', 'cut'],
                  },
                );
          // Serialización por la fila del producto. El lock se toma DESPUÉS del
          // bulkCreate a propósito: así un PUT o PATCH concurrente que corrió en el
          // hueco ya confirmó y su efecto es visible aquí (READ COMMITTED lee la
          // versión más reciente tras esperar el lock). Quien confirma segundo ve el
          // estado del primero: si la categoría dejó de ser 'chicken' o la fila
          // desapareció a mitad de vuelo, esta transacción se aborta y el conjunto
          // propio se revierte — nunca queda un no-chicken con presentaciones
          // (RN-006-03) ni filas huérfanas.
          // Es FOR NO KEY UPDATE y no FOR UPDATE: el INSERT de product_portions ya
          // dejó un FOR KEY SHARE sobre esta misma fila (el disparador de la FK hacia
          // products). FOR UPDATE choca con el FOR KEY SHARE que retiene el otro PUT
          // en vuelo y los dos esperan mutuamente: deadlock 40P01. FOR NO KEY UPDATE
          // no choca con FOR KEY SHARE pero sí consigo mismo y con el UPDATE de
          // updateProduct (categoría no es columna clave), así que la serialización
          // PUT||PUT y PUT||PATCH sigue completa sin abrir esa trampa.
          const locked = await models.Product.findByPk(productId, {
            attributes: ['id', 'category'],
            lock: Transaction.LOCK.NO_KEY_UPDATE,
            transaction,
          });
          if (locked === null) throw createProductNotFoundError();
          if (locked.category !== 'chicken') throw createPortionsNotAllowedError();
          // Filas confirmadas por otro PUT que corrió en el hueco (antes de que esta
          // transacción tomara el lock): el que confirma último gana — se borra todo
          // lo que no sea mío. Con un conjunto vacío se borra todo, igual que pide
          // PUT {portions: []}.
          const keepIds = created.map((row) => row.id);
          await models.ProductPortion.destroy({
            where: keepIds.length > 0 ? { productId, id: { [Op.notIn]: keepIds } } : { productId },
            transaction,
          });
        });
      } catch (error) {
        // Si la fila del producto desapareció entre la lectura inicial y el INSERT
        // (hoy solo posible por SQL directo — la API nunca borra productos,
        // RN-005-04), el bulkCreate cae en la FK con un error crudo de Sequelize que
        // sería 500 con log. Se relee la existencia del producto y se traduce al
        // 404 de dominio, igual que la corrección ADV-005-25 en updateProduct.
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
