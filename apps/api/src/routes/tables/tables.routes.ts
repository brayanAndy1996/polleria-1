import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { TablesController } from '../../controllers/tables.controller.ts';
import { TABLE_ID_MESSAGE } from '../../controllers/tables.controller.ts';
import { requireRole } from '../../middlewares/auth.ts';
import { malformedIdParamError } from '../../middlewares/id-param-error.ts';
import { requireJsonContentType, requireJsonObject } from '../../middlewares/json-body.ts';

/**
 * Rutas del salón (spec 009, D-009-13): el tablero, la configuración de mesas y las
 * operaciones de mesa sobre pedidos — todas bajo /api/tables y con Cache-Control:
 * no-store también en los errores (el prefijo '/api/tables' de app.ts las cubre y
 * aquí se reafirma, idempotente).
 *
 * Lectura: GET la llama cualquier rol con sesión (RN-009-01). Configuración —
 * alta y edición de mesas — es solo de admin (RN-009-03). Las operaciones de
 * salón — abrir cuenta, unir y separar — son de waiter o admin (RN-009-03):
 * 401 sin sesión y 403 a kitchen y cashier.
 *
 * Solo las rutas con cuerpo llevan las guardias JSON: POST /, PATCH /:tableId y
 * POST /:tableId/join — abrir y separar no reciben cuerpo (AC-21).
 */
export function createTablesRoutes(
  controller: TablesController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/', requireAuth, controller.list);
  router.post(
    '/',
    requireJsonContentType,
    requireJsonObject,
    requireAuth,
    requireRole('admin'),
    controller.create,
  );
  router.patch(
    '/:tableId',
    requireJsonContentType,
    requireJsonObject,
    requireAuth,
    requireRole('admin'),
    controller.update,
  );
  router.post(
    '/:tableId/orders',
    requireAuth,
    requireRole('waiter', 'admin'),
    controller.openOrder,
  );
  router.post(
    '/:tableId/join',
    requireJsonContentType,
    requireJsonObject,
    requireAuth,
    requireRole('waiter', 'admin'),
    controller.join,
  );
  router.post('/:tableId/leave', requireAuth, requireRole('waiter', 'admin'), controller.leave);
  // Un percent-encoding roto en tableId ('%', 'abc%') estalla al decodificar la ruta,
  // antes del parser: se responde con el mismo VALIDATION_ERROR del parámetro.
  router.use(malformedIdParamError('tableId', TABLE_ID_MESSAGE));
  return router;
}
