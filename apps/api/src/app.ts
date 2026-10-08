import express from 'express';
import type { Express } from 'express';
import type { Sequelize } from 'sequelize';
import { configureZodLocale } from './config/zod-locale.ts';
import { createBodyReader } from './middlewares/body-reader.ts';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.ts';
import { createApiRouter } from './routes/index.ts';
import { createHealthService } from './services/health.service.ts';
import { createAuthController } from './controllers/auth.controller.ts';
import { createUsersController } from './controllers/users.controller.ts';
import { createRequireAuth } from './middlewares/auth.ts';
import { defineModels } from './models/index.ts';
import { createAuthService } from './services/auth/auth.service.ts';
import { createLoginLimiter } from './services/auth/login-limiter.ts';
import { createBcryptPinHasher } from './services/auth/pin-hasher.ts';
import type { PinHasher } from './services/auth/pin-hasher.ts';
import { createSessionService } from './services/auth/session.service.ts';
import { createUserService } from './services/users/user.service.ts';
import { createUserAdminService } from './services/users/user-admin.service.ts';

export interface AppDependencies {
  sequelize: Sequelize;
  /** Tiempo máximo de espera a la base en /api/health. Por defecto, DEFAULT_HEALTH_TIMEOUT_MS. */
  healthTimeoutMs?: number;
  now?: () => Date;
  pinHasher?: PinHasher;
}

/** Arma la aplicación Express sin ponerla a escuchar (eso lo hace server.ts). */
export function createApp({
  sequelize,
  healthTimeoutMs,
  now = () => new Date(),
  pinHasher = createBcryptPinHasher(),
}: AppDependencies): Express {
  configureZodLocale();

  const healthService = createHealthService({ sequelize, timeoutMs: healthTimeoutMs });
  const models = defineModels(sequelize);
  const sessionService = createSessionService({ models, now });
  // Un solo LoginLimiter compartido (D-004-08): limpiar el conteo desde la administración
  // (desactivar o restablecer el PIN) afecta al inicio de sesión real.
  const loginLimiter = createLoginLimiter({ now });
  const authService = createAuthService({
    models,
    sessionService,
    pinHasher,
    loginLimiter,
  });
  const userService = createUserService({ models, pinHasher });
  const userAdminService = createUserAdminService({
    models,
    pinHasher,
    sessionService,
    loginLimiter,
  });
  const authController = createAuthController({ authService });
  const usersController = createUsersController({ userService, userAdminService });
  const requireAuth = createRequireAuth({ sessionService });

  const app = express();

  app.disable('x-powered-by');
  app.use(createBodyReader());
  app.use('/api', createApiRouter({ healthService, authController, usersController, requireAuth }));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
