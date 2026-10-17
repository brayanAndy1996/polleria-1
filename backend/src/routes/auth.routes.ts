import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { AuthController } from '../controllers/auth.controller.ts';

export function createAuthRoutes(controller: AuthController, requireAuth: RequestHandler): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/users', controller.listUsers);
  router.post('/login', controller.login);
  router.get('/me', requireAuth, controller.me);
  router.post('/logout', controller.logout);
  return router;
}
