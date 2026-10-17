import { UniqueConstraintError } from 'sequelize';
import {
  PRODUCT_CATEGORIES,
  createProductRequestSchema,
  updateProductRequestSchema,
} from '@polleria/shared';
import type { Product } from '@polleria/shared';
import { AppError } from '../../errors/app-error.ts';
import type { Models } from '../../models/index.ts';
import { createProductHasPortionsError } from './product-portion.service.ts';
import {
  createProductHasItemsError,
  createProductIsComponentError,
} from '../combo-items/combo-item.service.ts';

export interface ProductService {
  listProducts(): Promise<Product[]>;
  createProduct(input: unknown): Promise<Product>;
  updateProduct(productId: number, input: unknown): Promise<Product>;
}

export function createProductNotFoundError(): AppError {
  return new AppError({
    code: 'PRODUCT_NOT_FOUND',
    message: 'Ese producto no existe.',
    httpStatus: 404,
  });
}
export function createProductNameTakenError(): AppError {
  return new AppError({
    code: 'PRODUCT_NAME_TAKEN',
    message: 'Ya existe un producto con ese nombre.',
    httpStatus: 409,
  });
}

/**
 * La API expone exactamente las cinco claves de Product (D-005-02): nunca createdAt,
 * updatedAt ni el nombre en snake_case de la columna.
 */
function toProduct(product: {
  id: number;
  name: string;
  category: Product['category'];
  priceCents: number;
  isActive: boolean;
}): Product {
  const { id, name, category, priceCents, isActive } = product;
  return { id, name, category, priceCents, isActive };
}

/**
 * Servicio de la carta (spec 005, D-005-13). Sin transacciones ni bloqueos: no hay
 * ningún invariante entre filas que proteger — crear es un solo INSERT (el índice
 * único products_name_unique resuelve la carrera de duplicados con 409) y editar un
 * solo UPDATE. createProduct y updateProduct parsean su entrada con los esquemas de
 * shared para que el servicio sea seguro aunque se llame sin HTTP.
 */
export function createProductService({ models }: { models: Models }): ProductService {
  // Orden de la carta (D-005-04): categoría en el orden de PRODUCT_CATEGORIES, nombre con
  // colación española insensible a mayúsculas y tildes, y los empates por id.
  const collator = new Intl.Collator('es', { sensitivity: 'base' });
  return {
    async listProducts() {
      const products = await models.Product.findAll({
        attributes: ['id', 'name', 'category', 'priceCents', 'isActive'],
      });
      return products
        .map((product) => toProduct(product))
        .sort(
          (first, second) =>
            PRODUCT_CATEGORIES.indexOf(first.category) -
              PRODUCT_CATEGORIES.indexOf(second.category) ||
            collator.compare(first.name, second.name) ||
            first.id - second.id,
        );
    },
    async createProduct(input) {
      const { name, category, priceCents } = createProductRequestSchema.parse(input);
      try {
        // Todo producto nace activo (RN-005-09): is_active sale del DEFAULT de la base.
        const product = await models.Product.create({ name, category, priceCents });
        return toProduct(product);
      } catch (error) {
        if (error instanceof UniqueConstraintError) throw createProductNameTakenError();
        throw error;
      }
    },
    async updateProduct(productId, input) {
      const changes = updateProductRequestSchema.parse(input);
      const product = await models.Product.findByPk(productId);
      if (product === null) throw createProductNotFoundError();
      // Guardia de la 006 (RN-006-03): la categoría no se puede retirar de 'chicken'
      // mientras el producto tenga presentaciones cargadas — primero se vacían con
      // PUT .../portions (portions: []) y después se cambia la categoría. Pasar a
      // 'chicken' o editar name/priceCents/isActive se permite con o sin presentaciones.
      const leavingChicken = changes.category !== undefined && changes.category !== 'chicken';
      if (leavingChicken) {
        const portionsCount = await models.ProductPortion.count({ where: { productId } });
        if (portionsCount > 0) throw createProductHasPortionsError();
      }
      // Guardia de la 007 (D-007-07, RN-007-10): la categoría no se puede retirar de
      // 'combo' mientras el producto tenga componentes — primero se vacían con
      // PUT .../items (items: []) y después se cambia la categoría. Pasar a 'combo' o
      // editar name/priceCents/isActive se permite con o sin componentes.
      const leavingCombo = changes.category !== undefined && changes.category !== 'combo';
      if (leavingCombo) {
        const itemsCount = await models.ComboItem.count({ where: { comboId: productId } });
        if (itemsCount > 0) throw createProductHasItemsError();
      }
      // Guardia de la 007 (D-007-07, RN-007-10): un producto que es componente de algún
      // combo no puede cambiar de categoría — cubre los dos huecos reales de invariante
      // (volver 'combo' un componente, que sería anidado, y sacar de 'chicken' un
      // componente con portion declarada). El flujo correcto es quitarlo del combo con
      // PUT .../items y recién cambiarle la categoría. PATCH a la misma categoría o de
      // otros campos se permite.
      const changingCategory =
        changes.category !== undefined && changes.category !== product.category;
      if (changingCategory) {
        const usesCount = await models.ComboItem.count({ where: { productId } });
        if (usesCount > 0) throw createProductIsComponentError();
      }
      // Solo los campos recibidos: lo que no vino queda como está.
      const updates: Partial<Pick<Product, 'name' | 'category' | 'priceCents' | 'isActive'>> = {};
      if (changes.name !== undefined) updates.name = changes.name;
      if (changes.category !== undefined) updates.category = changes.category;
      if (changes.priceCents !== undefined) updates.priceCents = changes.priceCents;
      if (changes.isActive !== undefined) updates.isActive = changes.isActive;
      // Valores originales para revertir si un PUT de presentaciones se confirma en
      // el hueco entre el conteo y el UPDATE (la guardia de RN-006-03 ya pasó).
      const original = {
        name: product.name,
        category: product.category,
        priceCents: product.priceCents,
        isActive: product.isActive,
      };
      try {
        await product.update(updates);
      } catch (error) {
        if (error instanceof UniqueConstraintError) throw createProductNameTakenError();
        throw error;
      }
      // ADV-005-25: si la fila desapareció entre el findByPk y el UPDATE (hoy solo
      // posible por SQL directo — la API nunca borra productos, RN-005-04), el UPDATE
      // no falla: afecta cero filas y la instancia conserva los valores en memoria.
      // Devolverla respondería 200 de un producto fantasma, así que la existencia se
      // confirma con una lectura y un id borrado a mitad de vuelo responde 404 igual
      // que uno inexistente. Sin transacción (D-005-13): solo se detecta el UPDATE
      // sin filas.
      if ((await models.Product.findByPk(productId, { attributes: ['id'] })) === null)
        throw createProductNotFoundError();
      // La guardia previa tiene un hueco: un PUT .../portions que confirme entre el
      // conteo y el UPDATE dejaría un no-chicken con presentaciones (RN-006-03).
      // El PUT serializado bloquea esta misma fila (FOR NO KEY UPDATE) antes de
      // confirmar, así que el re-count posterior ve el estado definitivo: si
      // aparecieron filas, el PATCH pierde — se revierte la fila a sus valores
      // originales y se responde 409, nunca un no-chicken con presentaciones ni un
      // 200 con cambio a medias.
      if (leavingChicken) {
        const portionsCount = await models.ProductPortion.count({
          where: { productId },
        });
        if (portionsCount > 0) {
          await product.update(original);
          throw createProductHasPortionsError();
        }
      }
      // El mismo hueco con PUT .../items (D-007-07): si un PUT de componentes se
      // confirmó entre el conteo y el UPDATE —su INSERT esperó al FOR NO KEY UPDATE
      // de esta fila— el re-count posterior lo ve y el PATCH se revierte: nunca un
      // producto fuera de 'combo' con componentes (PRODUCT_HAS_ITEMS) ni un producto
      // recategorizado mientras sigue siendo componente de un combo
      // (PRODUCT_IS_COMPONENT).
      if (leavingCombo) {
        const itemsCount = await models.ComboItem.count({ where: { comboId: productId } });
        if (itemsCount > 0) {
          await product.update(original);
          throw createProductHasItemsError();
        }
      }
      if (changingCategory) {
        const usesCount = await models.ComboItem.count({ where: { productId } });
        if (usesCount > 0) {
          await product.update(original);
          throw createProductIsComponentError();
        }
      }
      return toProduct(product);
    },
  };
}
