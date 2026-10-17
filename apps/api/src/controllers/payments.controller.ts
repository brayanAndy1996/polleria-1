import { idempotencyKeySchema, paymentRequestSchema } from '@polleria/shared';
import type { Request, RequestHandler, Response } from 'express';
import { AppError } from '../errors/app-error.ts';
import { createUnauthenticatedError, getAuthContext } from '../middlewares/auth.ts';
import type { PaymentService } from '../services/payments/payment.service.ts';
import { parseIdParam } from './id-param.ts';
import { ORDER_ID_MESSAGE } from './orders.controller.ts';

export const PAYMENT_ID_MESSAGE = 'El identificador del pago no es válido.';
export interface PaymentsController {
  listOrders: RequestHandler;
  getBill: RequestHandler;
  create: RequestHandler;
  getPayment: RequestHandler;
}

function validationError(path: string, message: string): AppError {
  return new AppError({
    code: 'VALIDATION_ERROR',
    httpStatus: 400,
    message: 'Los datos enviados no son válidos.',
    details: { issues: [{ path, message }] },
  });
}
function actorOf(res: Response) {
  const context = getAuthContext(res);
  if (context === undefined) throw createUnauthenticatedError();
  return { userId: context.user.id };
}
function strictQuery(req: Request, allowed: string[] = []): void {
  if (Object.keys(req.query).some((key) => !allowed.includes(key)))
    throw validationError('', 'La consulta contiene parámetros no permitidos.');
}
function keyOf(req: Request): string {
  const occurrences = req.rawHeaders?.filter(
    (value, index) => index % 2 === 0 && value.toLowerCase() === 'idempotency-key',
  ).length;
  const parsed = idempotencyKeySchema.safeParse(req.headers['idempotency-key']);
  if (!parsed.success || (occurrences !== undefined && occurrences > 1))
    throw validationError('idempotencyKey', 'El cobro necesita una sola cabecera Idempotency-Key.');
  return parsed.data;
}

export function createPaymentsController({
  paymentService,
}: {
  paymentService: PaymentService;
}): PaymentsController {
  return {
    listOrders: async (req, res, next) => {
      try {
        strictQuery(req, ['afterOrderId']);
        const raw = req.query['afterOrderId'];
        const after =
          raw === undefined
            ? undefined
            : parseIdParam(
                typeof raw === 'string' ? raw : undefined,
                'afterOrderId',
                'El identificador del pedido no es válido.',
              );
        res.json(await paymentService.listCashierOrders(after, actorOf(res)));
      } catch (error) {
        next(error);
      }
    },
    getBill: async (req, res, next) => {
      try {
        strictQuery(req);
        const orderId = parseIdParam(req.params['orderId'], 'orderId', ORDER_ID_MESSAGE);
        res.json({ bill: await paymentService.getBill(orderId, actorOf(res)) });
      } catch (error) {
        next(error);
      }
    },
    create: async (req, res, next) => {
      try {
        strictQuery(req);
        const key = keyOf(req);
        const orderId = parseIdParam(req.params['orderId'], 'orderId', ORDER_ID_MESSAGE);
        const body = paymentRequestSchema.parse(req.body);
        res.status(201).json(await paymentService.createPayment(orderId, body, key, actorOf(res)));
      } catch (error) {
        next(error);
      }
    },
    getPayment: async (req, res, next) => {
      try {
        strictQuery(req);
        const paymentId = parseIdParam(req.params['paymentId'], 'paymentId', PAYMENT_ID_MESSAGE);
        res.json({ payment: await paymentService.getPayment(paymentId, actorOf(res)) });
      } catch (error) {
        next(error);
      }
    },
  };
}
