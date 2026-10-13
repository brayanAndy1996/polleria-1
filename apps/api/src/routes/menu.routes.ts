import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { MenuController } from '../controllers/menu.controller.ts';

/**
 * La carta para armar pedidos (spec 010, D-010-14): GET /api/menu, cualquier rol
 * con sesión. Cache-Control: no-store también en los errores (idempotente con el
 * prefijo '/api/menu' de app.ts).
 */
export function createMenuRoutes(controller: MenuController, requireAuth: RequestHandler): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/', requireAuth, controller.list);
  return router;
}
