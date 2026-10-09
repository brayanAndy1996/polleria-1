import {
  ERROR_CODES,
  createProductRequestSchema,
  updateProductRequestSchema,
} from '@polleria/shared';
import type { RequestHandler } from 'express';
import { AppError } from '../errors/app-error.ts';
import type { ProductService } from '../services/products/product.service.ts';

export interface ProductsController {
  list: RequestHandler;
  create: RequestHandler;
  update: RequestHandler;
}

const PRODUCT_ID_MESSAGE = 'El identificador del producto no es válido.';
/** Máximo del tipo INTEGER de PostgreSQL (spec 005, D-005-09; misma regla que userId). */
const PRODUCT_ID_MAX = 2147483647;

/**
 * Convierte el parámetro `productId` de la ruta en un entero positivo: ^[0-9]+$ y entre 1
 * y 2147483647. Cualquier otra cosa ('abc', '0', '1.5', '-3', números enormes o un
 * parámetro repetido) es un VALIDATION_ERROR con el issue en `productId` (D-005-09).
 * Exportado para que el controller de presentaciones de la 006 use la misma regla sin
 * duplicarla (sección 12 de la spec 006).
 */
export function parseProductIdParam(raw: string | string[] | undefined): number {
  const productId = typeof raw === 'string' && /^[0-9]+$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(productId) || productId < 1 || productId > PRODUCT_ID_MAX)
    throw new AppError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Los datos enviados no son válidos.',
      httpStatus: 400,
      details: { issues: [{ path: 'productId', message: PRODUCT_ID_MESSAGE }] },
    });
  return productId;
}

export function createProductsController({
  productService,
}: {
  productService: ProductService;
}): ProductsController {
  return {
    list: async (_req, res) => {
      res.json({ products: await productService.listProducts() });
    },
    create: async (req, res, next) => {
      try {
        const input = createProductRequestSchema.parse(req.body);
        // Un producto recién creado siempre es activo (RN-005-09).
        res.status(201).json(await productService.createProduct(input));
      } catch (error) {
        next(error);
      }
    },
    update: async (req, res, next) => {
      try {
        const productId = parseProductIdParam(req.params['productId']);
        const input = updateProductRequestSchema.parse(req.body);
        res.json(await productService.updateProduct(productId, input));
      } catch (error) {
        next(error);
      }
    },
  };
}
