import { ERROR_CODES, idempotencyKeySchema } from '@polleria/shared';
import type { Request, RequestHandler, Response } from 'express';
import { AppError } from '../errors/app-error.ts';
import { createUnauthenticatedError, getAuthContext } from '../middlewares/auth.ts';
import type { OrderItemService } from '../services/order-items/order-item.service.ts';
import { parseIdParam } from './id-param.ts';
import { ORDER_ID_MESSAGE } from './orders.controller.ts';

export interface OrderItemsController {
  send: RequestHandler;
  requestVoid: RequestHandler;
  void: RequestHandler;
  rejectVoid: RequestHandler;
  listTickets: RequestHandler;
}

/** Mensaje del issue de `itemId`; exportado para el manejador de URIError del router. */
export const ORDER_ITEM_ID_MESSAGE = 'El identificador del ítem no es válido.';

const IDEMPOTENCY_KEY_MESSAGE = 'El envío necesita la cabecera Idempotency-Key.';

/** El parámetro `orderId` de la ruta con la regla compartida de parseIdParam. */
function parseOrderIdParam(raw: string | string[] | undefined): number {
  return parseIdParam(raw, 'orderId', ORDER_ID_MESSAGE);
}

/** El parámetro `itemId` de la ruta con la regla compartida de parseIdParam. */
function parseItemIdParam(raw: string | string[] | undefined): number {
  return parseIdParam(raw, 'itemId', ORDER_ITEM_ID_MESSAGE);
}

/**
 * La cabecera Idempotency-Key se valida ANTES que los parámetros y el cuerpo
 * (D-010-09): falta, mal formada o duplicada es un VALIDATION_ERROR con el issue
 * en `idempotencyKey` — no en la raíz como produciría el ZodError directo.
 */
function idempotencyKeyOf(req: Request): string {
  const raw = req.headers['idempotency-key'];
  const parsed = idempotencyKeySchema.safeParse(Array.isArray(raw) ? undefined : raw);
  if (!parsed.success)
    throw new AppError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Los datos enviados no son válidos.',
      httpStatus: 400,
      details: { issues: [{ path: 'idempotencyKey', message: IDEMPOTENCY_KEY_MESSAGE }] },
    });
  return parsed.data;
}

/** El usuario de la sesión, obligatorio en estas rutas (igual que en orders). */
function actorOf(res: Response): { userId: number } {
  const context = getAuthContext(res);
  if (context === undefined) throw createUnauthenticatedError();
  return { userId: context.user.id };
}

/**
 * Controller de los ítems del pedido (spec 010): envío con idempotencia, ciclo de
 * anulación y listado de comandas. Las respuestas llevan el pedido completo (y la
 * comanda cuando aplica) para que el salón se redibuje sin otra llamada.
 */
export function createOrderItemsController({
  orderItemService,
}: {
  orderItemService: OrderItemService;
}): OrderItemsController {
  return {
    send: async (req, res, next) => {
      try {
        const key = idempotencyKeyOf(req);
        const orderId = parseOrderIdParam(req.params['orderId']);
        res
          .status(201)
          .json(await orderItemService.sendItems(orderId, req.body, key, actorOf(res)));
      } catch (error) {
        next(error);
      }
    },
    requestVoid: async (req, res, next) => {
      try {
        const key = idempotencyKeyOf(req);
        const orderId = parseOrderIdParam(req.params['orderId']);
        const itemId = parseItemIdParam(req.params['itemId']);
        res.json(await orderItemService.requestVoid(orderId, itemId, req.body, key, actorOf(res)));
      } catch (error) {
        next(error);
      }
    },
    void: async (req, res, next) => {
      try {
        const key = idempotencyKeyOf(req);
        const orderId = parseOrderIdParam(req.params['orderId']);
        const itemId = parseItemIdParam(req.params['itemId']);
        res.json(await orderItemService.voidItem(orderId, itemId, req.body, key, actorOf(res)));
      } catch (error) {
        next(error);
      }
    },
    rejectVoid: async (req, res, next) => {
      try {
        const key = idempotencyKeyOf(req);
        const orderId = parseOrderIdParam(req.params['orderId']);
        const itemId = parseItemIdParam(req.params['itemId']);
        res.json(await orderItemService.rejectVoid(orderId, itemId, key, actorOf(res)));
      } catch (error) {
        next(error);
      }
    },
    listTickets: async (req, res, next) => {
      try {
        const orderId = parseOrderIdParam(req.params['orderId']);
        res.json(await orderItemService.listOrderTickets(orderId));
      } catch (error) {
        next(error);
      }
    },
  };
}
