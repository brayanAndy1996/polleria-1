import { Router } from 'express';
import type { RequestHandler } from 'express';
import { createHealthController } from '../controllers/health.controller.ts';
import type { AuthController } from '../controllers/auth.controller.ts';
import type { UsersController } from '../controllers/users.controller.ts';
import type { ProductsController } from '../controllers/products.controller.ts';
import type { ProductPortionsController } from '../controllers/product-portions.controller.ts';
import type { HealthService } from '../services/health.service.ts';
import { createHealthRoutes } from './health.routes.ts';
import { createAuthRoutes } from './auth.routes.ts';
import { createUserRoutes } from './users.routes.ts';
import { createProductRoutes } from './products.routes.ts';

export interface ApiRouterDependencies {
  healthService: HealthService;
  authController: AuthController;
  usersController: UsersController;
  productsController: ProductsController;
  productPortionsController: ProductPortionsController;
  requireAuth: RequestHandler;
}

/** Router de la API. createApp lo monta en /api. */
export function createApiRouter({
  healthService,
  authController,
  usersController,
  productsController,
  productPortionsController,
  requireAuth,
}: ApiRouterDependencies): Router {
  const router = Router();

  router.use(createHealthRoutes(createHealthController({ healthService })));
  router.use('/auth', createAuthRoutes(authController, requireAuth));
  router.use('/users', createUserRoutes(usersController, requireAuth));
  router.use(
    '/products',
    createProductRoutes(productsController, productPortionsController, requireAuth),
  );

  return router;
}
