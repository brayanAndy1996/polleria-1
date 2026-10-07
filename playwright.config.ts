import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { defineConfig, devices } from '@playwright/test';
import { assertTestDatabase } from './apps/api/src/db/assert-test-database.ts';

// Los E2E usan su propia API (127.0.0.1:4100) y su propia web (puerto 3100), ambas conectadas a
// polleria_test. Nunca reutilizan servidores ya levantados (RN-001-03): si lo hicieran, podrían
// terminar usando la API de desarrollo conectada a polleria_dev.
const API_PORT = 4100;
const WEB_PORT = 3100;
const API_URL = `http://127.0.0.1:${API_PORT}`;
const WEB_URL = `http://localhost:${WEB_PORT}`;
const SERVER_TIMEOUT_MS = 120_000;

// Lee DATABASE_URL_TEST del entorno o, si no está, de apps/api/.env. Solo toma esa variable y no
// modifica process.env: las demás variables del archivo (como DATABASE_URL de desarrollo) no pasan
// a los procesos hijos. El valor nunca se muestra en los mensajes.
function readDatabaseUrlTest(): string {
  let value = process.env.DATABASE_URL_TEST;

  if (value === undefined) {
    const envFile = resolve(import.meta.dirname, 'apps/api/.env');
    if (existsSync(envFile)) {
      value = parseEnv(readFileSync(envFile, 'utf8')).DATABASE_URL_TEST;
    }
  }

  if (value === undefined || value.trim() === '') {
    throw new Error(
      'Falta DATABASE_URL_TEST. Las pruebas E2E usan la base polleria_test: ' +
        'defínela en apps/api/.env (copia apps/api/.env.example) o como variable de entorno.',
    );
  }

  // Guardia de las pruebas (RN-001-02): si la base no termina en _test, esta línea lanza un error
  // en español (sin la URL ni la clave) y Playwright aborta antes de levantar ningún servidor.
  // Además, la API en modo test (NODE_ENV=test) vuelve a verificarlo al arrancar.
  assertTestDatabase(value);

  return value;
}

const databaseUrlTest = readDatabaseUrlTest();

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  // Todas las pruebas comparten una sola API y una sola base (polleria_test): en serie.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1366, height: 768 },
      },
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        browserName: 'chromium',
        viewport: { width: 360, height: 740 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      name: 'API',
      command: 'node --disable-warning=ExperimentalWarning apps/api/src/server.ts',
      cwd: import.meta.dirname,
      url: `${API_URL}/api/health`,
      reuseExistingServer: false,
      timeout: SERVER_TIMEOUT_MS,
      env: {
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: String(API_PORT),
        DATABASE_URL: databaseUrlTest,
      },
    },
    {
      name: 'Web',
      command: `pnpm exec next dev --port ${WEB_PORT}`,
      cwd: resolve(import.meta.dirname, 'apps/web'),
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: SERVER_TIMEOUT_MS,
      env: {
        NODE_ENV: 'development',
        API_INTERNAL_URL: API_URL,
      },
    },
  ],
});
