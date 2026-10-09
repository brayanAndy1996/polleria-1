import { Router } from 'express';
import type { RequestHandler } from 'express';
import { createHealthController } from '../controllers/health.controller.ts';
import type { AuthController } from '../controllers/auth.controller.ts';
import type { UsersController } from '../controllers/users.controller.ts';
import type { ProductsController } from '../controllers/products.controller.ts';
import type { ProductPortionsController } from '../controllers/product-portions.controller.ts';
import type { ComboItemsController } from '../controllers/combo-items.controller.ts';
import type { HealthService } from '../services/health.service.ts';
import { createHealthRoutes } from './health.routes.ts';
import { createAuthRoutes } from './auth.routes.ts';
import { createUserRoutes } from './users.routes.ts';
import { createProductRoutes } from './products.routes.ts';
import { createComboItemsRoutes } from './combo-items/combo-items.routes.ts';

export interface ApiRouterDependencies {
  healthService: HealthService;
  authController: AuthController;
  usersController: UsersController;
  productsController: ProductsController;
  productPortionsController: ProductPortionsController;
  comboItemsController: ComboItemsController;
  requireAuth: RequestHandler;
}

/** Router de la API. createApp lo monta en /api. */
export function createApiRouter({
  healthService,
  authController,
  usersController,
  productsController,
  productPortionsController,
  comboItemsController,
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
  // Los componentes del combo son un sub-recurso de products (spec 007): mismo montaje
  // en '/products' que la carta, antes del 404 para que los métodos no declarados de
  // /items sigan respondiendo 404.
  router.use('/products', createComboItemsRoutes(comboItemsController, requireAuth));

  return router;
}
