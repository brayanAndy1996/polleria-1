import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { OrdersController } from '../../controllers/orders.controller.ts';
import type { OrderItemsController } from '../../controllers/order-items.controller.ts';
import { ORDER_ID_MESSAGE } from '../../controllers/orders.controller.ts';
import { requireRole } from '../../middlewares/auth.ts';
import { malformedIdParamError } from '../../middlewares/id-param-error.ts';
import { requireJsonContentType, requireJsonObject } from '../../middlewares/json-body.ts';

/**
 * Rutas del ciclo del pedido (spec 009, D-009-13), bajo /api/orders y con
 * Cache-Control: no-store también en los errores (idempotente con el prefijo
 * '/api/orders' de app.ts).
 *
 * Lectura: GET la llama cualquier rol con sesión. Operaciones de salón — mover,
 * pedir la cuenta, servir y cancelar — son de waiter o admin (RN-009-03); la
 * señal de listo también la puede poner kitchen (es su aviso al salón), y caja
 * recibe 403 en todas: cobrar es otra fase.
 *
 * Solo las rutas con cuerpo llevan las guardias JSON: POST /:orderId/move y
 * POST /:orderId/cancel — las señales no reciben cuerpo (AC-21).
 */
export function createOrdersRoutes(
  controller: OrdersController,
  orderItemsController: OrderItemsController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/:orderId', requireAuth, controller.get);
  // Las comandas del pedido (spec 010): cualquier rol con sesión.
  router.get('/:orderId/tickets', requireAuth, orderItemsController.listTickets);
  router.post(
    '/:orderId/move',
    requireJsonContentType,
    requireJsonObject,
    requireAuth,
    requireRole('waiter', 'admin'),
    controller.move,
  );
  router.post(
    '/:orderId/request-bill',
    requireAuth,
    requireRole('waiter', 'admin'),
    controller.requestBill,
  );
  router.post(
    '/:orderId/ready',
    requireAuth,
    requireRole('waiter', 'admin', 'kitchen'),
    controller.markReady,
  );
  router.post(
    '/:orderId/served',
    requireAuth,
    requireRole('waiter', 'admin'),
    controller.markServed,
  );
  router.post(
    '/:orderId/cancel',
    requireJsonContentType,
    requireJsonObject,
    requireAuth,
    requireRole('waiter', 'admin'),
    controller.cancel,
  );
  // Un percent-encoding roto en orderId ('%', 'abc%') estalla al decodificar la ruta,
  // antes del parser: se responde con el mismo VALIDATION_ERROR del parámetro.
  router.use(malformedIdParamError('orderId', ORDER_ID_MESSAGE));
  router.use(malformedIdParamError('itemId', 'El identificador del ítem no es válido.'));
  return router;
}
