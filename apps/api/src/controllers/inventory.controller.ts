import { idempotencyKeySchema, inventoryQuerySchema } from '@polleria/shared';
import type { Request, RequestHandler, Response } from 'express';
import { AppError } from '../errors/app-error.ts';
import { getAuthContext, createUnauthenticatedError } from '../middlewares/auth.ts';
import { parseIdParam } from './id-param.ts';
import type { InventoryService } from '../services/inventory/inventory.service.ts';

export interface InventoryController {
  getInventory: RequestHandler;
  getAvailability: RequestHandler;
  listMovements: RequestHandler;
  setChickenControl: RequestHandler;
  setDrinkControl: RequestHandler;
  addChickenBatch: RequestHandler;
  addDrinkReceipt: RequestHandler;
  adjust: RequestHandler;
}
function invalid(path: string, message: string) {
  return new AppError({
    code: 'VALIDATION_ERROR',
    httpStatus: 400,
    message: 'Los datos enviados no son válidos.',
    details: { issues: [{ path, message }] },
  });
}
function actor(res: Response) {
  const auth = getAuthContext(res);
  if (auth === undefined) throw createUnauthenticatedError();
  return { userId: auth.user.id };
}
function key(req: Request) {
  const occurrences = req.rawHeaders.filter(
    (value, index) => index % 2 === 0 && value.toLowerCase() === 'idempotency-key',
  ).length;
  const parsed = idempotencyKeySchema.safeParse(req.headers['idempotency-key']);
  if (!parsed.success || occurrences > 1)
    throw invalid('idempotencyKey', 'Envía una sola cabecera Idempotency-Key válida.');
  return parsed.data;
}
export function createInventoryController({
  inventoryService: service,
}: {
  inventoryService: InventoryService;
}): InventoryController {
  const handler =
    (
      run: (req: Request, res: Response) => Promise<unknown>,
      status = 200,
      history = false,
    ): RequestHandler =>
    async (req, res, next) => {
      try {
        if (Object.keys(req.query).some((name) => !history || name !== 'afterId'))
          throw invalid('', 'La consulta contiene parámetros no permitidos.');
        res.status(status).json(await run(req, res));
      } catch (error) {
        next(error);
      }
    };
  const productId = (req: Request) =>
    parseIdParam(
      req.params['productId'],
      'productId',
      'El identificador del producto no es válido.',
    );
  return {
    getInventory: handler((_req, res) => service.getInventory(actor(res))),
    getAvailability: handler((_req, res) => service.getAvailability(actor(res))),
    listMovements: handler(
      (req, res) => {
        const raw = req.query['afterId'];
        if (raw !== undefined && (typeof raw !== 'string' || !/^[1-9][0-9]*$/.test(raw)))
          throw invalid('afterId', 'El identificador del movimiento no es válido.');
        const query = inventoryQuerySchema.parse({
          ...(raw === undefined ? {} : { afterId: Number(raw) }),
        });
        return service.listMovements(query.afterId, actor(res));
      },
      200,
      true,
    ),
    setChickenControl: handler((req, res) =>
      service.setChickenControl(req.body, key(req), actor(res)),
    ),
    setDrinkControl: handler((req, res) =>
      service.setDrinkControl(productId(req), req.body, key(req), actor(res)),
    ),
    addChickenBatch: handler(
      (req, res) => service.addChickenBatch(req.body, key(req), actor(res)),
      201,
    ),
    addDrinkReceipt: handler(
      (req, res) => service.addDrinkReceipt(productId(req), req.body, key(req), actor(res)),
      201,
    ),
    adjust: handler((req, res) => service.adjust(req.body, key(req), actor(res)), 201),
  };
}
