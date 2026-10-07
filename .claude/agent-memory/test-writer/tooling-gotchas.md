---
name: tooling-gotchas
description: Trampas de herramientas ya encontradas al escribir pruebas en este monorepo (MSW 3, Vite en jsdom, Playwright, tool Bash)
metadata:
  type: feedback
---

Reglas aprendidas escribiendo la fase roja de la spec 001. Evitan repetir errores de configuración.

- MSW 3.0.2: `server.listen({ onUnhandledFrame: 'error' })`. La opción `onUnhandledRequest` ya no existe y rompe el typecheck.
  **Why:** el tipo SharedOptions de msw 3 solo declara `onUnhandledFrame`.
  **How to apply:** en `apps/web/tests/setup.ts` y en cualquier setup nuevo de MSW.
- En el proyecto web (jsdom) Vite transforma `new URL('./x', import.meta.url)` como un asset y falla con "Failed to resolve import". Usar `path.resolve(import.meta.dirname, ...)` para ubicar archivos (.env.example, fixtures) en todos los tests.
  **Why:** `vite:asset-import-meta-url` actúa en entornos tipo cliente.
  **How to apply:** en cualquier test o helper que lea archivos por ruta.
- Playwright no resuelve `@polleria/shared` desde `e2e/` (la raíz no lo declara). Importar por ruta relativa: `../packages/shared/src/index.ts`. Tampoco hay tipos DOM en el tsconfig raíz: usar `page.evaluate<T>('expresión como texto')`.
- El tool Bash falla ("unexpected EOF") con algunos heredocs largos con comillas y plantillas; crear los archivos con Write en su lugar.
- umzug 3.8.3 usa tinyglobby: un glob absoluto con barras normales (`C:/.../*.ts`) funciona en Windows.
- Fixtures de migraciones/seeders: sin imports de valores de `sequelize` (solo `import type`), SQL directo con `context.sequelize.query`. Cargan bien con el type stripping de Node 24.1.
- `no-unsafe-*` de ESLint (recommendedTypeChecked) marca en cascada todo valor que viene de un módulo inexistente: en fase roja `pnpm lint` no puede dar 0. Se demuestra que es solo cascada validando contra una implementación desechable (ver [[validar-rojo-con-copia-desechable]]).
