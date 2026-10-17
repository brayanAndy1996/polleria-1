import { Router } from 'express';
import { createInventoryRoutes } from './inventory.routes.ts';
import type { InventoryController } from '../controllers/inventory.controller.ts';
import { createPaymentsRoutes } from './payments.routes.ts';
import type { PaymentsController } from '../controllers/payments.controller.ts';
import type { RequestHandler } from 'express';
import { createHealthController } from '../controllers/health.controller.ts';
import type { AuthController } from '../controllers/auth.controller.ts';
import type { UsersController } from '../controllers/users.controller.ts';
import type { ProductsController } from '../controllers/products.controller.ts';
import type { ProductPortionsController } from '../controllers/product-portions.controller.ts';
import type { ComboItemsController } from '../controllers/combo-items.controller.ts';
import type { TablesController } from '../controllers/tables.controller.ts';
import type { OrdersController } from '../controllers/orders.controller.ts';
import type { OrderItemsController } from '../controllers/order-items.controller.ts';
import type { MenuController } from '../controllers/menu.controller.ts';
import type { HealthService } from '../services/health.service.ts';
import { createHealthRoutes } from './health.routes.ts';
import { createAuthRoutes } from './auth.routes.ts';
import { createUserRoutes } from './users.routes.ts';
import { createProductRoutes } from './products.routes.ts';
import { createComboItemsRoutes } from './combo-items/combo-items.routes.ts';
import { createTablesRoutes } from './tables/tables.routes.ts';
import { createOrdersRoutes } from './orders/orders.routes.ts';
import { createOrderItemsRoutes } from './orders/order-items.routes.ts';
import { createMenuRoutes } from './menu.routes.ts';
import { createKitchenTicketPrintsRoutes } from './kitchen-ticket-prints.routes.ts';
import type { KitchenTicketPrintsController } from '../controllers/kitchen-ticket-prints.controller.ts';

export interface ApiRouterDependencies {
  inventoryController: InventoryController;
  paymentsController: PaymentsController;
  healthService: HealthService;
  authController: AuthController;
  usersController: UsersController;
  productsController: ProductsController;
  productPortionsController: ProductPortionsController;
  comboItemsController: ComboItemsController;
  tablesController: TablesController;
  ordersController: OrdersController;
  orderItemsController: OrderItemsController;
  menuController: MenuController;
  kitchenTicketPrintsController: KitchenTicketPrintsController;
  requireAuth: RequestHandler;
}

/** Router de la API. createApp lo monta en /api. */
export function createApiRouter({
  inventoryController,
  paymentsController,
  healthService,
  authController,
  usersController,
  productsController,
  productPortionsController,
  comboItemsController,
  tablesController,
  ordersController,
  orderItemsController,
  menuController,
  kitchenTicketPrintsController,
  requireAuth,
}: ApiRouterDependencies): Router {
  const router = Router();
  router.use('/inventory', createInventoryRoutes(inventoryController, requireAuth));

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
  // Salón y ciclo del pedido (spec 009): /api/tables cubre tablero, configuración
  // y apertura/unión/separación desde la mesa; /api/orders cubre detalle, movimiento
  // y las señales del pedido.
  router.use('/tables', createTablesRoutes(tablesController, requireAuth));
  router.use('/orders', createOrdersRoutes(ordersController, orderItemsController, requireAuth));
  // Ítems del pedido (spec 010): sub-rutas de /orders para envío y anulación, y
  // /menu para la carta completa.
  router.use('/orders', createOrderItemsRoutes(orderItemsController, requireAuth));
  router.use('/menu', createMenuRoutes(menuController, requireAuth));
  router.use(createKitchenTicketPrintsRoutes(kitchenTicketPrintsController, requireAuth));
  router.use(createPaymentsRoutes(paymentsController, requireAuth));

  return router;
}
