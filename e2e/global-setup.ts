import { spawn } from 'node:child_process';

const moduleUrl = (relativePath: string) =>
  JSON.stringify(new URL(relativePath, import.meta.url).href);
const preparationSource = `
import {
  assertConnectedToTestDatabase,
  closeTestDatabase,
  connectTestDatabase,
  getTestDatabaseUrl,
  migrateAndClearAuthTables,
} from ${moduleUrl('../apps/api/tests/helpers/test-database.ts')};
import { defineModels } from ${moduleUrl('../apps/api/src/models/index.ts')};
import { createBcryptPinHasher } from ${moduleUrl('../apps/api/src/services/auth/pin-hasher.ts')};
import { createUserService } from ${moduleUrl('../apps/api/src/services/users/user.service.ts')};

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
    const service = createUserService({
      models: defineModels(sequelize),
      pinHasher: createBcryptPinHasher(),
    });
    for (const user of [
      { username: 'e2e.mozo', displayName: 'Mozo E2E', roles: ['waiter'], pin: '2468' },
      { username: 'e2e.caja', displayName: 'Caja E2E', roles: ['cashier'], pin: '1357' },
      { username: 'e2e.admin', displayName: 'Admin E2E', roles: ['admin'], pin: '135790' },
      { username: 'e2e.mozocaja', displayName: 'Mozo Caja E2E', roles: ['waiter', 'cashier'], pin: '8642' },
    ]) {
      await service.createUser(user);
    }
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
