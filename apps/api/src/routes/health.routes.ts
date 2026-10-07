import { Router } from 'express';
import type { HealthController } from '../controllers/health.controller.ts';

/** Ruta pública (RN-001-06): seguirá sin autenticación cuando exista. */
export function createHealthRoutes(controller: HealthController): Router {
  const router = Router();

  router.get('/health', controller.getHealth);

  return router;
}
