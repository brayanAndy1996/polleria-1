import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { ProductsController } from '../controllers/products.controller.ts';
import type { ProductPortionsController } from '../controllers/product-portions.controller.ts';
import { requireRole } from '../middlewares/auth.ts';

/**
 * Rutas de la carta (spec 005, D-005-08) y de las presentaciones del pollo (spec 006).
 * Todas llevan Cache-Control: no-store (también las de error). GET —de productos y de
 * .../portions— la puede llamar cualquier rol con sesión (RN-005-02, RN-006-02); POST,
 * PATCH y PUT exigen además el rol admin (RN-005-01, RN-006-01): 401 sin sesión y 403
 * con cualquier combinación de roles que no incluya admin.
 */
export function createProductRoutes(
  controller: ProductsController,
  portionsController: ProductPortionsController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/', requireAuth, controller.list);
  router.post('/', requireAuth, requireRole('admin'), controller.create);
  router.patch('/:productId', requireAuth, requireRole('admin'), controller.update);
  router.get('/:productId/portions', requireAuth, portionsController.list);
  router.put('/:productId/portions', requireAuth, requireRole('admin'), portionsController.replace);
  return router;
}
