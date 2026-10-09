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
import { createProductService } from './services/products/product.service.ts';
import { createProductsController } from './controllers/products.controller.ts';
import { createProductPortionService } from './services/products/product-portion.service.ts';
import { createProductPortionsController } from './controllers/product-portions.controller.ts';
import { createComboItemService } from './services/combo-items/combo-item.service.ts';
import { createComboItemsController } from './controllers/combo-items.controller.ts';

export interface AppDependencies {
  sequelize: Sequelize;
  /** Tiempo máximo de espera a la base en /api/health. Por defecto, DEFAULT_HEALTH_TIMEOUT_MS. */
  healthTimeoutMs?: number;
  now?: () => Date;
  pinHasher?: PinHasher;
}

/**
 * Rutas que siempre responden con Cache-Control: no-store (sesiones y administración de
 * usuarios). La cabecera se fija ANTES del lector del cuerpo: si este rechaza la
 * solicitud (INVALID_JSON, PAYLOAD_TOO_LARGE...) la respuesta de error también la lleva.
 * Los routers la vuelven a fijar, lo cual es idempotente.
 */
const NO_STORE_PATH_PREFIXES = ['/api/auth', '/api/users', '/api/products'] as const;

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
  const productService = createProductService({ models });
  const productsController = createProductsController({ productService });
  const productPortionService = createProductPortionService({ models });
  const productPortionsController = createProductPortionsController({
    productPortionService,
  });
  const comboItemService = createComboItemService({ models });
  const comboItemsController = createComboItemsController({ comboItemService });
  const requireAuth = createRequireAuth({ sessionService });

  const app = express();

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    // Express enruta sin distinguir mayúsculas: la comparación se hace en minúsculas
    // para que /api/USERS o /api/Auth/... también lleven la cabecera (ADV-004-25).
    const path = req.path.toLowerCase();
    if (NO_STORE_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)))
      res.set('Cache-Control', 'no-store');
    next();
  });
  // PUT .../items exige INVALID_BODY ante un JSON válido que no sea objeto (AC-15 de la
  // 007), distinto del INVALID_JSON estricto del resto de la API: la ruta lee el cuerpo
  // con un lector laxo que corre antes del estricto global —una vez leído, el global lo
  // deja pasar— y la forma de objeto la verifica requireJsonObject en su router.
  app.use('/api/products/:productId/items', createBodyReader({ strict: false }));
  app.use(createBodyReader());
  app.use(
    '/api',
    createApiRouter({
      healthService,
      authController,
      usersController,
      productsController,
      productPortionsController,
      comboItemsController,
      requireAuth,
    }),
  );
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
