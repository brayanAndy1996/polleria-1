import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { KitchenTicketPrintsController } from '../controllers/kitchen-ticket-prints.controller.ts';
import { requireRole } from '../middlewares/auth.ts';
import { requireJsonContentType, requireJsonObject } from '../middlewares/json-body.ts';
import { malformedIdParamError } from '../middlewares/id-param-error.ts';

export function createKitchenTicketPrintsRoutes(
  controller: KitchenTicketPrintsController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();
  router.get('/orders/:orderId/ticket-prints', requireAuth, controller.listForOrder);
  router.get(
    '/kitchen-ticket-prints/attention',
    requireAuth,
    requireRole('waiter', 'cashier', 'admin'),
    controller.listAttention,
  );
  router.post(
    '/kitchen-ticket-prints/:ticketId/reprint',
    requireAuth,
    requireRole('waiter', 'cashier', 'admin'),
    requireJsonContentType,
    requireJsonObject,
    controller.reprint,
  );
  router.use(malformedIdParamError('ticketId', 'El identificador de la comanda no es válido.'));
  return router;
}
