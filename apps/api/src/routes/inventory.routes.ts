import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { InventoryController } from '../controllers/inventory.controller.ts';
import { requireRole } from '../middlewares/auth.ts';
import { malformedIdParamError } from '../middlewares/id-param-error.ts';
import { requireJsonContentType, requireJsonObject } from '../middlewares/json-body.ts';

export function createInventoryRoutes(
  controller: InventoryController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get(
    '/availability',
    requireAuth,
    requireRole('waiter', 'admin'),
    controller.getAvailability,
  );
  router.use(requireAuth, requireRole('admin'));
  router.get('/', controller.getInventory);
  router.get('/movements', controller.listMovements);
  const body = [requireJsonContentType, requireJsonObject];
  router.put('/chicken/control', ...body, controller.setChickenControl);
  router.put('/drinks/:productId/control', ...body, controller.setDrinkControl);
  router.post('/chicken/batches', ...body, controller.addChickenBatch);
  router.post('/drinks/:productId/receipts', ...body, controller.addDrinkReceipt);
  router.post('/adjustments', ...body, controller.adjust);
  router.use(malformedIdParamError('productId', 'El identificador del producto no es válido.'));
  return router;
}
