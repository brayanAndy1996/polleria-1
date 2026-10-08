import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { UsersController } from '../controllers/users.controller.ts';
import { requireRole } from '../middlewares/auth.ts';

/**
 * Rutas de administración de usuarios (spec 004). Todas llevan Cache-Control: no-store
 * (también las de error) y exigen sesión con el rol admin (RN-004-01): 401 sin sesión y
 * 403 con cualquier otro rol o combinación que no incluya admin.
 */
export function createUserRoutes(controller: UsersController, requireAuth: RequestHandler): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use(requireAuth, requireRole('admin'));
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.patch('/:userId', controller.update);
  router.post('/:userId/pin', controller.resetPin);
  return router;
}
