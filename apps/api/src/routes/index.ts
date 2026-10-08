import { Router } from 'express';
import type { RequestHandler } from 'express';
import { createHealthController } from '../controllers/health.controller.ts';
import type { AuthController } from '../controllers/auth.controller.ts';
import type { HealthService } from '../services/health.service.ts';
import { createHealthRoutes } from './health.routes.ts';
import { createAuthRoutes } from './auth.routes.ts';

export interface ApiRouterDependencies {
  healthService: HealthService;
  authController: AuthController;
  requireAuth: RequestHandler;
}

/** Router de la API. createApp lo monta en /api. */
export function createApiRouter({
  healthService,
  authController,
  requireAuth,
}: ApiRouterDependencies): Router {
  const router = Router();

  router.use(createHealthRoutes(createHealthController({ healthService })));
  router.use('/auth', createAuthRoutes(authController, requireAuth));

  return router;
}
