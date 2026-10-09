import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { ComboItemsController } from '../../controllers/combo-items.controller.ts';
import { requireRole } from '../../middlewares/auth.ts';
import { requireJsonContentType, requireJsonObject } from '../../middlewares/json-body.ts';

/**
 * Rutas de los componentes de un combo (spec 007, D-007-08), bajo
 * /api/products/{productId}/items: el combo ES un producto y sus componentes son un
 * sub-recurso igual que las presentaciones de la 006. Todas llevan Cache-Control:
 * no-store (también las de error — el prefijo '/api/products' de app.ts ya las cubre y
 * aquí se reafirma, idempotente). GET la puede llamar cualquier rol con sesión
 * (RN-007-01); PUT exige además el rol admin: 401 sin sesión y 403 con cualquier
 * combinación de roles que no incluya admin.
 *
 * El router se monta en '/products' del router de /api: las rutas quedan en
 * /api/products/:productId/items (la forma completa que anota D-007-08).
 */
export function createComboItemsRoutes(
  controller: ComboItemsController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/:productId/items', requireAuth, controller.list);
  router.put(
    '/:productId/items',
    requireJsonContentType,
    requireJsonObject,
    requireAuth,
    requireRole('admin'),
    controller.replace,
  );
  return router;
}
