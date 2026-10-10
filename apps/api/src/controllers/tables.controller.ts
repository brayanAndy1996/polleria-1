import {
  createTableRequestSchema,
  joinTableRequestSchema,
  updateTableRequestSchema,
} from '@polleria/shared';
import type { RequestHandler, Response } from 'express';
import { createUnauthenticatedError, getAuthContext } from '../middlewares/auth.ts';
import type { OrderService } from '../services/orders/order.service.ts';
import type { TableService } from '../services/tables/table.service.ts';
import { parseIdParam } from './id-param.ts';

export interface TablesController {
  list: RequestHandler;
  create: RequestHandler;
  update: RequestHandler;
  openOrder: RequestHandler;
  join: RequestHandler;
  leave: RequestHandler;
}

/** Mensaje del issue de `tableId`; exportado para el manejador de URIError del router. */
export const TABLE_ID_MESSAGE = 'El identificador de la mesa no es válido.';

/** El parámetro `tableId` de la ruta con la regla compartida de parseIdParam. */
function parseTableIdParam(raw: string | string[] | undefined): number {
  return parseIdParam(raw, 'tableId', TABLE_ID_MESSAGE);
}

/**
 * El usuario de la sesión, obligatorio en las operaciones de salón (el actor de cada
 * pedido es quien manda la cookie, nunca un dato del cuerpo — RF-03). requireAuth ya
 * dejó el contexto; si falta es un acceso sin sesión igual que en me/logout.
 */
function actorOf(res: Response): { userId: number } {
  const context = getAuthContext(res);
  if (context === undefined) throw createUnauthenticatedError();
  return { userId: context.user.id };
}

/**
 * Controller del salón (spec 009): el tablero, la configuración de mesas y las
 * operaciones de mesa que tocan pedidos (abrir, unir, separar) comparten este
 * router porque todas cuelgan de /api/tables/{tableId}.
 */
export function createTablesController({
  tableService,
  orderService,
}: {
  tableService: TableService;
  orderService: OrderService;
}): TablesController {
  return {
    list: async (_req, res) => {
      res.json({ tables: await tableService.listTables() });
    },
    create: async (req, res, next) => {
      try {
        const input = createTableRequestSchema.parse(req.body);
        // Toda mesa nace activa y libre (RN-009-09).
        res.status(201).json(await tableService.createTable(input));
      } catch (error) {
        next(error);
      }
    },
    update: async (req, res, next) => {
      try {
        const tableId = parseTableIdParam(req.params['tableId']);
        const input = updateTableRequestSchema.parse(req.body);
        res.json(await tableService.updateTable(tableId, input));
      } catch (error) {
        next(error);
      }
    },
    openOrder: async (req, res, next) => {
      try {
        const tableId = parseTableIdParam(req.params['tableId']);
        // La apertura responde 201 con el pedido creado (D-009-14).
        res.status(201).json(await orderService.openOrder(tableId, actorOf(res)));
      } catch (error) {
        next(error);
      }
    },
    join: async (req, res, next) => {
      try {
        const tableId = parseTableIdParam(req.params['tableId']);
        const { intoTableId } = joinTableRequestSchema.parse(req.body);
        res.json(await orderService.joinTable(tableId, intoTableId, actorOf(res)));
      } catch (error) {
        next(error);
      }
    },
    leave: async (req, res, next) => {
      try {
        const tableId = parseTableIdParam(req.params['tableId']);
        res.json(await orderService.leaveTable(tableId, actorOf(res)));
      } catch (error) {
        next(error);
      }
    },
  };
}
