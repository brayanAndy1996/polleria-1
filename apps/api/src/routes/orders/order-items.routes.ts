import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { OrderItemsController } from '../../controllers/order-items.controller.ts';
import { ORDER_ITEM_ID_MESSAGE } from '../../controllers/order-items.controller.ts';
import { ORDER_ID_MESSAGE } from '../../controllers/orders.controller.ts';
import { requireRole } from '../../middlewares/auth.ts';
import { malformedIdParamsError } from '../../middlewares/id-param-error.ts';
import { requireJsonContentType, requireJsonObject } from '../../middlewares/json-body.ts';

/**
 * Rutas de los ítems del pedido (spec 010): el envío (POST items) y el ciclo de
 * anulación (request-void / void / reject-void), montadas bajo /api/orders como
 * sub-recurso del pedido.
 *
 * Roles (RN-010-03/04/05): enviar y solicitar la anulación son de waiter o admin;
 * aprobar/anular y rechazar son exclusivas del administrador — la regla 6 lo exige.
 * Las tres rutas con cuerpo llevan las guardias JSON antes de la autenticación,
 * igual que el resto de la API; reject-void no lee cuerpo (el patrón
 * BODILESS_PATH_PATTERN de app.ts lo exime del lector).
 */
export function createOrderItemsRoutes(
  controller: OrderItemsController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.post(
    '/:orderId/items',
    requireJsonContentType,
    requireJsonObject,
    requireAuth,
    requireRole('waiter', 'admin'),
    controller.send,
  );
  router.post(
    '/:orderId/items/:itemId/request-void',
    requireJsonContentType,
    requireJsonObject,
    requireAuth,
    requireRole('waiter', 'admin'),
    controller.requestVoid,
  );
  router.post(
    '/:orderId/items/:itemId/void',
    requireJsonContentType,
    requireJsonObject,
    requireAuth,
    requireRole('admin'),
    controller.void,
  );
  router.post(
    '/:orderId/items/:itemId/reject-void',
    requireAuth,
    requireRole('admin'),
    controller.rejectVoid,
  );
  // Un percent-encoding roto en cualquier id ('%', 'abc%') estalla al decodificar
  // la ruta, antes del parser: el issue etiqueta el segmento que falla —orderId va
  // en la posición 1 e itemId en la 3 de la URL relativa del router.
  router.use(
    malformedIdParamsError([
      { index: 1, path: 'orderId', message: ORDER_ID_MESSAGE },
      { index: 3, path: 'itemId', message: ORDER_ITEM_ID_MESSAGE },
    ]),
  );
  return router;
}
