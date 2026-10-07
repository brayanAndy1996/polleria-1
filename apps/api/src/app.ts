import express from 'express';
import type { Express } from 'express';
import type { Sequelize } from 'sequelize';
import { configureZodLocale } from './config/zod-locale.ts';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.ts';
import { createApiRouter } from './routes/index.ts';
import { createHealthService } from './services/health.service.ts';

export interface AppDependencies {
  sequelize: Sequelize;
  /** Tiempo máximo de espera a la base en /api/health. Por defecto, DEFAULT_HEALTH_TIMEOUT_MS. */
  healthTimeoutMs?: number;
}

/** Arma la aplicación Express sin ponerla a escuchar (eso lo hace server.ts). */
export function createApp({ sequelize, healthTimeoutMs }: AppDependencies): Express {
  configureZodLocale();

  const healthService = createHealthService({ sequelize, timeoutMs: healthTimeoutMs });

  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', createApiRouter({ healthService }));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
