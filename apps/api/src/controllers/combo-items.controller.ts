import { replaceComboItemsRequestSchema } from '@polleria/shared';
import type { RequestHandler } from 'express';
import { parseProductIdParam } from './products.controller.ts';
import type { ComboItemService } from '../services/combo-items/combo-item.service.ts';

export interface ComboItemsController {
  list: RequestHandler;
  replace: RequestHandler;
}

/**
 * Handlers de GET y PUT /api/products/{productId}/items (spec 007). Solo traducen HTTP:
 * el productId de la ruta con la misma regla de la 005 (parseProductIdParam,
 * reutilizado sin duplicarlo) y el cuerpo con el esquema de shared (los ZodError los
 * convierte el errorHandler en 400 VALIDATION_ERROR).
 */
export function createComboItemsController({
  comboItemService,
}: {
  comboItemService: ComboItemService;
}): ComboItemsController {
  return {
    list: async (req, res, next) => {
      try {
        const productId = parseProductIdParam(req.params['productId']);
        res.json({ items: await comboItemService.listComboItems(productId) });
      } catch (error) {
        next(error);
      }
    },
    replace: async (req, res, next) => {
      try {
        const productId = parseProductIdParam(req.params['productId']);
        const input = replaceComboItemsRequestSchema.parse(req.body);
        res.json({ items: await comboItemService.replaceComboItems(productId, input) });
      } catch (error) {
        next(error);
      }
    },
  };
}
