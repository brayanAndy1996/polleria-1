import { createProductRequestSchema, updateProductRequestSchema } from '@polleria/shared';
import type { RequestHandler } from 'express';
import type { ProductService } from '../services/products/product.service.ts';
import { parseIdParam } from './id-param.ts';

export interface ProductsController {
  list: RequestHandler;
  create: RequestHandler;
  update: RequestHandler;
}

const PRODUCT_ID_MESSAGE = 'El identificador del producto no es válido.';

/**
 * Convierte el parámetro `productId` de la ruta en un entero positivo (D-005-09):
 * la regla compartida de parseIdParam con el mensaje propio del parámetro.
 * Exportado para que el controller de presentaciones de la 006 y el de
 * componentes de la 007 usen la misma regla sin duplicarla.
 */
export function parseProductIdParam(raw: string | string[] | undefined): number {
  return parseIdParam(raw, 'productId', PRODUCT_ID_MESSAGE);
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
