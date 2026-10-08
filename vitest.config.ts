import { defineConfig } from 'vitest/config';

// Vitest 5 declara los proyectos en `test.projects` (R-08). Las rutas de `include` son relativas a
// la raíz del monorepo, que es donde se ejecuta `pnpm test`. e2e/ no coincide con ningún `include`:
// lo corre Playwright (`pnpm test:e2e`), no Vitest.
//
// Nota para el test-writer: puede agregar `setupFiles` dentro de `test` en el proyecto que lo
// necesite (T-10 para api-integration y T-15 para web, por ejemplo apps/web/tests/setup.ts).
// Esa es la única configuración de este archivo que le corresponde modificar.
//
// Todos los proyectos resuelven '@polleria/shared' por el enlace del workspace de pnpm. El paquete
// exporta su código fuente (./src/index.ts), que Vite transforma sin paso de compilación.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'shared',
          environment: 'node',
          include: ['packages/shared/{src,tests}/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'api-unit',
          environment: 'node',
          include: ['apps/api/src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'api-integration',
          environment: 'node',
          include: ['apps/api/tests/**/*.test.ts'],
          // Todos los archivos comparten la base polleria_test: se ejecutan uno tras otro.
          fileParallelism: false,
          testTimeout: 15_000,
        },
      },
      {
        // Sin @vitejs/plugin-react (ADR 0001): el JSX se transforma con el runtime automático.
        oxc: { jsx: { runtime: 'automatic' } },
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['apps/web/{src,tests}/**/*.test.{ts,tsx}'],
          // MSW, jest-dom y la limpieza de React Testing Library (T-15).
          setupFiles: ['apps/web/tests/setup.ts'],
        },
      },
    ],

    // La cobertura es una opción de la raíz: no se configura por proyecto.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/shared/src/**', 'apps/api/src/**', 'apps/web/src/**'],
      exclude: [
        '**/*.{test,spec}.{ts,tsx}',
        '**/tests/**',
        '**/*.d.ts',
        '**/*.config.{ts,js,mjs,cjs}',
        'apps/api/src/server.ts',
        'apps/api/src/db/cli.ts',
        'apps/api/src/print-test-page.ts',
        'apps/api/src/create-admin.ts',
        'apps/api/src/db/migrations/**',
        'apps/api/src/db/seeders/**',
        'apps/web/src/app/layout.tsx',
      ],
      // R-09: 80 % de líneas en general y 90 % en packages/shared y en los services de la API.
      thresholds: {
        lines: 80,
        'packages/shared/src/**': { lines: 90 },
        'apps/api/src/services/**': { lines: 90 },
      },
    },
  },
});
