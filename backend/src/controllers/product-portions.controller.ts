import { replaceProductPortionsRequestSchema } from '@polleria/shared';
import type { RequestHandler } from 'express';
import { parseProductIdParam } from './products.controller.ts';
import type { ProductPortionService } from '../services/products/product-portion.service.ts';

export interface ProductPortionsController {
  list: RequestHandler;
  replace: RequestHandler;
}

/**
 * Handlers de GET y PUT /api/products/{productId}/portions (spec 006). Solo traducen
 * HTTP: el productId de la ruta con la misma regla de la 005 (parseProductIdParam,
 * reutilizado sin duplicarlo) y el cuerpo con el esquema de shared (los ZodError los
 * convierte el errorHandler en 400 VALIDATION_ERROR).
 */
export function createProductPortionsController({
  productPortionService,
}: {
  productPortionService: ProductPortionService;
}): ProductPortionsController {
  return {
    list: async (req, res, next) => {
      try {
        const productId = parseProductIdParam(req.params['productId']);
        res.json({ portions: await productPortionService.listProductPortions(productId) });
      } catch (error) {
        next(error);
      }
    },
    replace: async (req, res, next) => {
      try {
        const productId = parseProductIdParam(req.params['productId']);
        const input = replaceProductPortionsRequestSchema.parse(req.body);
        res.json({
          portions: await productPortionService.replaceProductPortions(productId, input),
        });
      } catch (error) {
        next(error);
      }
    },
  };
}
