import { idempotencyKeySchema } from '@polleria/shared';
import type { RequestHandler, Response } from 'express';
import { AppError } from '../errors/app-error.ts';
import { getAuthContext, createUnauthenticatedError } from '../middlewares/auth.ts';
import type { KitchenTicketPrintService } from '../services/kitchen-ticket-prints/kitchen-ticket-print.service.ts';
import { parseIdParam } from './id-param.ts';

export interface KitchenTicketPrintsController {
  listForOrder: RequestHandler;
  listAttention: RequestHandler;
  reprint: RequestHandler;
}
function actorOf(res: Response) {
  const context = getAuthContext(res);
  if (context === undefined) throw createUnauthenticatedError();
  return { userId: context.user.id, roles: context.user.roles };
}
export function createKitchenTicketPrintsController(
  service: KitchenTicketPrintService,
): KitchenTicketPrintsController {
  return {
    listForOrder: async (req, res, next) => {
      try {
        res.json(
          await service.listForOrder(
            parseIdParam(
              req.params.orderId,
              'orderId',
              'El identificador del pedido no es válido.',
            ),
            actorOf(res),
          ),
        );
      } catch (error) {
        next(error);
      }
    },
    listAttention: async (req, res, next) => {
      try {
        const raw = req.query.afterTicketId;
        const after =
          raw === undefined
            ? undefined
            : parseIdParam(
                typeof raw === 'string' ? raw : undefined,
                'afterTicketId',
                'El identificador de la comanda no es válido.',
              );
        res.json(await service.listAttention(after, actorOf(res)));
      } catch (error) {
        next(error);
      }
    },
    reprint: async (req, res, next) => {
      try {
        const parsed = idempotencyKeySchema.safeParse(req.headers['idempotency-key']);
        if (!parsed.success)
          throw new AppError({
            code: 'VALIDATION_ERROR',
            message: 'Los datos enviados no son válidos.',
            httpStatus: 400,
            details: {
              issues: [
                {
                  path: 'idempotencyKey',
                  message: 'La copia necesita la cabecera Idempotency-Key.',
                },
              ],
            },
          });
        const id = parseIdParam(
          req.params.ticketId,
          'ticketId',
          'El identificador de la comanda no es válido.',
        );
        res.status(202).json(await service.requestReprint(id, req.body, parsed.data, actorOf(res)));
      } catch (error) {
        next(error);
      }
    },
  };
}
