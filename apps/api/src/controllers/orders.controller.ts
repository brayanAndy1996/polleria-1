import { cancelOrderRequestSchema, moveOrderRequestSchema } from '@polleria/shared';
import type { RequestHandler, Response } from 'express';
import { createUnauthenticatedError, getAuthContext } from '../middlewares/auth.ts';
import type { OrderService } from '../services/orders/order.service.ts';
import { parseIdParam } from './id-param.ts';

export interface OrdersController {
  get: RequestHandler;
  move: RequestHandler;
  requestBill: RequestHandler;
  markReady: RequestHandler;
  markServed: RequestHandler;
  cancel: RequestHandler;
}

/** Mensaje del issue de `orderId`; exportado para el manejador de URIError del router. */
export const ORDER_ID_MESSAGE = 'El identificador del pedido no es válido.';

/** El parámetro `orderId` de la ruta con la regla compartida de parseIdParam. */
function parseOrderIdParam(raw: string | string[] | undefined): number {
  return parseIdParam(raw, 'orderId', ORDER_ID_MESSAGE);
}

/** El usuario de la sesión, obligatorio en el ciclo del pedido (igual que en tables). */
function actorOf(res: Response): { userId: number } {
  const context = getAuthContext(res);
  if (context === undefined) throw createUnauthenticatedError();
  return { userId: context.user.id };
}

/**
 * Controller del ciclo del pedido (spec 009): detalle, movimiento y las cuatro
 * operaciones de señal/cierre. Cada ruta responde la forma completa del pedido
 * (D-009-14) para que el salón se redibuje sin otra llamada.
 */
export function createOrdersController({
  orderService,
}: {
  orderService: OrderService;
}): OrdersController {
  return {
    get: async (req, res, next) => {
      try {
        const orderId = parseOrderIdParam(req.params['orderId']);
        res.json(await orderService.getOrder(orderId));
      } catch (error) {
        next(error);
      }
    },
    move: async (req, res, next) => {
      try {
        const orderId = parseOrderIdParam(req.params['orderId']);
        const { tableId } = moveOrderRequestSchema.parse(req.body);
        res.json(await orderService.moveOrder(orderId, tableId, actorOf(res)));
      } catch (error) {
        next(error);
      }
    },
    requestBill: async (req, res, next) => {
      try {
        const orderId = parseOrderIdParam(req.params['orderId']);
        res.json(await orderService.requestBill(orderId, actorOf(res)));
      } catch (error) {
        next(error);
      }
    },
    markReady: async (req, res, next) => {
      try {
        const orderId = parseOrderIdParam(req.params['orderId']);
        res.json(await orderService.markReady(orderId, actorOf(res)));
      } catch (error) {
        next(error);
      }
    },
    markServed: async (req, res, next) => {
      try {
        const orderId = parseOrderIdParam(req.params['orderId']);
        res.json(await orderService.markServed(orderId, actorOf(res)));
      } catch (error) {
        next(error);
      }
    },
    cancel: async (req, res, next) => {
      try {
        const orderId = parseOrderIdParam(req.params['orderId']);
        const { reason } = cancelOrderRequestSchema.parse(req.body);
        res.json(await orderService.cancelOrder(orderId, reason, actorOf(res)));
      } catch (error) {
        next(error);
      }
    },
  };
}
