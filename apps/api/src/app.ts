import express from 'express';
import { createReportsService } from './services/reports/reports.service.ts';
import { createReportsController } from './controllers/reports.controller.ts';
import { createInventoryService } from './services/inventory/inventory.service.ts';
import { createInventoryController } from './controllers/inventory.controller.ts';
import { createPaymentService } from './services/payments/payment.service.ts';
import { createPaymentsController } from './controllers/payments.controller.ts';
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
import { createTableService } from './services/tables/table.service.ts';
import { createOrderService } from './services/orders/order.service.ts';
import { createTablesController } from './controllers/tables.controller.ts';
import { createOrdersController } from './controllers/orders.controller.ts';
import { createOrderItemService } from './services/order-items/order-item.service.ts';
import { createOrderItemsController } from './controllers/order-items.controller.ts';
import { createMenuService } from './services/menu/menu.service.ts';
import { createMenuController } from './controllers/menu.controller.ts';
import { createKitchenTicketPrintService } from './services/kitchen-ticket-prints/kitchen-ticket-print.service.ts';
import type { KitchenTicketPrintService } from './services/kitchen-ticket-prints/kitchen-ticket-print.service.ts';
import { createKitchenTicketPrintsController } from './controllers/kitchen-ticket-prints.controller.ts';
import { createPrinterService } from './services/printer/printer.service.ts';
import { createPrinterDriver } from './services/printer/create-printer-driver.ts';
import { DEFAULT_PRINTER_FILE_DIR } from './config/env.ts';

export interface AppDependencies {
  sequelize: Sequelize;
  /** Tiempo máximo de espera a la base en /api/health. Por defecto, DEFAULT_HEALTH_TIMEOUT_MS. */
  healthTimeoutMs?: number;
  now?: () => Date;
  pinHasher?: PinHasher;
  printService?: KitchenTicketPrintService;
}

/**
 * Rutas que siempre responden con Cache-Control: no-store (sesiones y administración de
 * usuarios). La cabecera se fija ANTES del lector del cuerpo: si este rechaza la
 * solicitud (INVALID_JSON, PAYLOAD_TOO_LARGE...) la respuesta de error también la lleva.
 * Los routers la vuelven a fijar, lo cual es idempotente.
 */
const NO_STORE_PATH_PREFIXES = [
  '/api/auth',
  '/api/users',
  '/api/products',
  '/api/tables',
  '/api/orders',
  '/api/menu',
  '/api/kitchen-ticket-prints',
  '/api/cashier',
  '/api/payments',
  '/api/inventory',
] as const;

/**
 * Rutas del salón que no leen cuerpo (spec 009, §9): abrir la cuenta, separar la
 * mesa y las tres señales del pedido. Si llega un cuerpo se ignora de verdad — el
 * lector global ni siquiera corre sobre ellas, así un JSON roto, un cuerpo mayor
 * de 100 KB o una codificación desconocida no pueden bloquear la operación
 * (ADV-009-14). El segmento del id admite cualquier valor: un id inválido debe
 * responder su 400 de validación, no un error del lector del cuerpo. El resto de
 * la API sigue pasando por el lector estricto.
 */
const BODILESS_PATH_PATTERN =
  /^\/api\/(?:tables\/[^/]+\/(?:orders|leave)|orders\/[^/]+\/(?:request-bill|ready|served)|orders\/[^/]+\/items\/[^/]+\/reject-void)\/?$/i;

/** Arma la aplicación Express sin ponerla a escuchar (eso lo hace server.ts). */
export function createApp({
  sequelize,
  healthTimeoutMs,
  now = () => new Date(),
  pinHasher = createBcryptPinHasher(),
  printService,
}: AppDependencies): Express {
  configureZodLocale();

  const healthService = createHealthService({ sequelize, timeoutMs: healthTimeoutMs });
  const models = defineModels(sequelize);
  const reportsService = createReportsService({ models, now });
  const reportsController = createReportsController({ reportsService });
  const inventoryService = createInventoryService({ models, now });
  const inventoryController = createInventoryController({ inventoryService });
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
  // Salón y ciclo del pedido (spec 009): el servicio de mesas deriva su estado del
  // pedido abierto; el de pedidos comparte modelos y devuelve la vista completa.
  const tableService = createTableService({ models });
  const orderService = createOrderService({ models });
  const tablesController = createTablesController({ tableService, orderService });
  const ordersController = createOrdersController({ orderService });
  // Ítems del pedido y carta (spec 010): envío idempotente, anulación con
  // auditoría y comandas; la carta resuelve presentaciones y componentes.
  const kitchenTicketPrintService =
    printService ??
    createKitchenTicketPrintService({
      models,
      now,
      printerService: createPrinterService({
        driver: createPrinterDriver({ driver: 'file', fileDir: DEFAULT_PRINTER_FILE_DIR }),
        fileDir: DEFAULT_PRINTER_FILE_DIR,
      }),
    });
  const kitchenTicketPrintsController =
    createKitchenTicketPrintsController(kitchenTicketPrintService);
  const orderItemService = createOrderItemService({
    models,
    kitchenTicketPrintService,
    inventoryService,
    now,
  });
  const orderItemsController = createOrderItemsController({ orderItemService });
  const menuService = createMenuService({ models });
  const menuController = createMenuController({ menuService });
  const paymentService = createPaymentService({ models, now });
  const paymentsController = createPaymentsController({ paymentService });
  const requireAuth = createRequireAuth({ sessionService });

  const app = express();

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    // Express enruta sin distinguir mayúsculas: la comparación se hace en minúsculas
    // para que /api/USERS o /api/Auth/... también lleven la cabecera (ADV-004-25).
    const path = req.path.toLowerCase();
    if (
      NO_STORE_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)) ||
      /^\/api\/reports\/daily-sales\/?$/i.test(req.path)
    )
      res.set('Cache-Control', 'no-store');
    next();
  });
  // PUT .../items exige INVALID_BODY ante un JSON válido que no sea objeto (AC-15 de la
  // 007), distinto del INVALID_JSON estricto del resto de la API: la ruta lee el cuerpo
  // con un lector laxo que corre antes del estricto global —una vez leído, el global lo
  // deja pasar— y la forma de objeto la verifica requireJsonObject en su router.
  app.use('/api/products/:productId/items', createBodyReader({ strict: false }));
  const strictBodyReader = createBodyReader();
  app.use((req, res, next) => {
    // Las rutas sin cuerpo de la spec 009 saltan al router directamente: cualquier
    // cuerpo que llegue se ignora sin leerse (§9). El resto conserva el lector
    // JSON estricto con sus límites y su 415/413/400 habituales.
    if (
      BODILESS_PATH_PATTERN.test(req.path) ||
      (req.method === 'GET' &&
        (/^\/api\/inventory(?:\/(?:availability|movements))?\/?$/i.test(req.path) ||
          /^\/api\/reports\/daily-sales\/?$/i.test(req.path)))
    ) {
      next();
      return;
    }
    strictBodyReader(req, res, next);
  });
  app.use(
    '/api',
    createApiRouter({
      reportsController,
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
    }),
  );
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
