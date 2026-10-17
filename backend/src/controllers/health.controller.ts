import type { RequestHandler } from 'express';
import type { HealthService } from '../services/health.service.ts';

export interface HealthController {
  getHealth: RequestHandler;
}

/** GET /api/health: 200 si la base responde, 503 con el mismo cuerpo si no (D-06). */
export function createHealthController({
  healthService,
}: {
  healthService: HealthService;
}): HealthController {
  return {
    getHealth: async (_req, res) => {
      const health = await healthService.check();

      res
        .status(health.status === 'ok' ? 200 : 503)
        .set('Cache-Control', 'no-store')
        .json(health);
    },
  };
}
