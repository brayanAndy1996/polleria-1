import { spawn } from 'node:child_process';

const moduleUrl = (relativePath: string) =>
  JSON.stringify(new URL(relativePath, import.meta.url).href);
const preparationSource = `
import {
  assertConnectedToTestDatabase,
  clearMenuTables,
  closeTestDatabase,
  connectTestDatabase,
  getTestDatabaseUrl,
  migrateAndClearAuthTables,
} from ${moduleUrl('../apps/api/tests/helpers/test-database.ts')};
import { defineModels } from ${moduleUrl('../apps/api/src/models/index.ts')};
import { createBcryptPinHasher } from ${moduleUrl('../apps/api/src/services/auth/pin-hasher.ts')};
import { createUserService } from ${moduleUrl('../apps/api/src/services/users/user.service.ts')};
import { createProductService } from ${moduleUrl('../apps/api/src/services/products/product.service.ts')};
import { createProductPortionService } from ${moduleUrl('../apps/api/src/services/products/product-portion.service.ts')};

try {
  if (decodeURIComponent(new URL(getTestDatabaseUrl()).pathname) !== '/polleria_test') {
    throw new Error('Base de pruebas no autorizada.');
  }
  const sequelize = await connectTestDatabase();
  try {
    if (await assertConnectedToTestDatabase(sequelize) !== 'polleria_test') {
      throw new Error('Conexión de pruebas no autorizada.');
    }
    await migrateAndClearAuthTables(sequelize);
    // Limpieza autorizada (spec 004): si una corrida anterior dejó al usuario que crea AC-26,
    // se borra para que la prueba lo dé de alta desde la interfaz. La tabla users está
    // autorizada y la conexión ya pasó las guardias de polleria_test.
    await sequelize.query("DELETE FROM users WHERE username = 'e2e.gestion'");
    // Limpieza autorizada de la carta (spec 008, D-008-14): combo_items, product_portions
    // y products ya están autorizadas en polleria_test por D-006-10 y D-007-14. Deja a la
    // vista los productos que las pruebas crearon por la interfaz en la corrida anterior.
    await clearMenuTables(sequelize);
    const models = defineModels(sequelize);
    const service = createUserService({
      models,
      pinHasher: createBcryptPinHasher(),
    });
    for (const user of [
      { username: 'e2e.mozo', displayName: 'Mozo E2E', roles: ['waiter'], pin: '2468' },
      { username: 'e2e.caja', displayName: 'Caja E2E', roles: ['cashier'], pin: '1357' },
      { username: 'e2e.admin', displayName: 'Admin E2E', roles: ['admin'], pin: '135790' },
      { username: 'e2e.mozocaja', displayName: 'Mozo Caja E2E', roles: ['waiter', 'cashier'], pin: '8642' },
      { username: 'e2e.gestion2', displayName: 'Gesti\u00F3n E2E Dos', roles: ['waiter'], pin: '5926' },
    ]) {
      await service.createUser(user);
    }
    // Semilla de la carta E2E (spec 008, D-008-14): un pollo con tres presentaciones,
    // un plato y una bebida. Los combos de las pruebas se arman por la interfaz.
    const productService = createProductService({ models });
    const portionService = createProductPortionService({ models });
    const pollo = await productService.createProduct({
      name: 'E2E Pollo',
      category: 'chicken',
      priceCents: 6500,
    });
    await portionService.replaceProductPortions(pollo.id, {
      portions: [
        { portion: 'quarter', cut: 'breast', priceCents: 1800 },
        { portion: 'quarter', cut: 'leg', priceCents: 1700 },
        { portion: 'whole', cut: null, priceCents: 6500 },
      ],
    });
    await productService.createProduct({
      name: 'E2E Chaufa',
      category: 'dish',
      priceCents: 1400,
    });
    await productService.createProduct({
      name: 'E2E Gaseosa',
      category: 'drink',
      priceCents: 400,
    });
  } finally {
    await closeTestDatabase(sequelize);
  }
} catch {
  process.exitCode = 1;
}
`;

export default async function globalSetup(): Promise<void> {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'test' };
  delete env.DATABASE_URL;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '--eval', preparationSource], {
      env,
      stdio: 'ignore',
      timeout: 30_000,
    });
    child.once('error', () => {
      reject(new Error('No se pudo iniciar la preparación nativa de polleria_test.'));
    });
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            'No se pudo preparar polleria_test. Revisa la conexión y las guardias de la base de pruebas.',
          ),
        );
    });
  });
}
