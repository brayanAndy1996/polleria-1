import { UniqueConstraintError } from 'sequelize';
import {
  PRODUCT_CATEGORIES,
  createProductRequestSchema,
  updateProductRequestSchema,
} from '@polleria/shared';
import type { Product } from '@polleria/shared';
import { AppError } from '../../errors/app-error.ts';
import type { Models } from '../../models/index.ts';

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
      // Solo los campos recibidos: lo que no vino queda como está.
      const updates: Partial<Pick<Product, 'name' | 'category' | 'priceCents' | 'isActive'>> = {};
      if (changes.name !== undefined) updates.name = changes.name;
      if (changes.category !== undefined) updates.category = changes.category;
      if (changes.priceCents !== undefined) updates.priceCents = changes.priceCents;
      if (changes.isActive !== undefined) updates.isActive = changes.isActive;
      try {
        await product.update(updates);
        return toProduct(product);
      } catch (error) {
        if (error instanceof UniqueConstraintError) throw createProductNameTakenError();
        throw error;
      }
    },
  };
}
