import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { PaymentsController } from '../controllers/payments.controller.ts';
import { PAYMENT_ID_MESSAGE } from '../controllers/payments.controller.ts';
import { ORDER_ID_MESSAGE } from '../controllers/orders.controller.ts';
import { requireRole } from '../middlewares/auth.ts';
import { malformedIdParamError } from '../middlewares/id-param-error.ts';
import { requireJsonContentType, requireJsonObject } from '../middlewares/json-body.ts';

export function createPaymentsRoutes(
  controller: PaymentsController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();
  const orders = Router();
  const payments = Router();
  const cashier = Router();
  for (const group of [orders, payments, cashier]) {
    group.use((_req, res, next) => {
      res.set('Cache-Control', 'no-store');
      next();
    });
  }
  cashier.get('/orders', requireAuth, requireRole('cashier', 'admin'), controller.listOrders);
  orders.get(
    '/:orderId/bill',
    requireAuth,
    requireRole('waiter', 'cashier', 'admin'),
    controller.getBill,
  );
  orders.post(
    '/:orderId/payments',
    requireAuth,
    requireRole('cashier', 'admin'),
    requireJsonContentType,
    requireJsonObject,
    controller.create,
  );
  payments.get('/:paymentId', requireAuth, requireRole('cashier', 'admin'), controller.getPayment);
  orders.use(malformedIdParamError('orderId', ORDER_ID_MESSAGE));
  payments.use(malformedIdParamError('paymentId', PAYMENT_ID_MESSAGE));
  router.use('/cashier', cashier);
  router.use('/orders', orders);
  router.use('/payments', payments);
  return router;
}
