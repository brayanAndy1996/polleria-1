import { Router } from 'express';
import { createHealthController } from '../controllers/health.controller.ts';
import type { HealthService } from '../services/health.service.ts';
import { createHealthRoutes } from './health.routes.ts';

export interface ApiRouterDependencies {
  healthService: HealthService;
}

/** Router de la API. createApp lo monta en /api. */
export function createApiRouter({ healthService }: ApiRouterDependencies): Router {
  const router = Router();

  router.use(createHealthRoutes(createHealthController({ healthService })));

  return router;
}
