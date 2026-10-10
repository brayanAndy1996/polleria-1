import type { RequestHandler } from 'express';
import type { MenuService } from '../services/menu/menu.service.ts';

export interface MenuController {
  list: RequestHandler;
}

/**
 * Controller de la carta para armar pedidos (spec 010, D-010-14): GET /api/menu
 * responde { products } con la forma y el orden de AC-14.
 */
export function createMenuController({
  menuService,
}: {
  menuService: MenuService;
}): MenuController {
  return {
    list: async (_req, res, next) => {
      try {
        res.json(await menuService.listMenu());
      } catch (error) {
        next(error);
      }
    },
  };
}
