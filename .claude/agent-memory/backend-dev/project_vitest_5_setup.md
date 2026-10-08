---
name: vitest-5-setup-notas
description: Hechos no obvios de Vitest 5 / Vite 8 en este monorepo (avisos de peer esperados, umbrales, JSX, fetch relativo en jsdom)
metadata:
  type: project
---

Verificado en T-05 (spec 001, 2026-10-07) con vitest 5.0.3, Vite 8.3.3 (oxc/rolldown, no esbuild), msw 3.0.2, jsdom 29.1.1.

- `pnpm install` muestra "unmet peer msw@^2.4.9: found 3.0.2" bajo `@vitest/mocker`. Es un peer OPCIONAL: no es un conflicto, no hay que cambiar versiones ni detenerse. MSW 3 funciona con Vitest 5 en el proyecto web.
- Los proyectos van en `test.projects`; `coverage` solo existe en la raíz. JSX automático en Vite 8: `oxc: { jsx: { runtime: 'automatic' } }` dentro del proyecto inline.
- El umbral global de cobertura cuenta TAMBIÉN los archivos de los globs (`packages/shared/src/**`, `apps/api/src/services/**`); no es "el resto". Los globs de umbral son relativos a la raíz.
- `coverage.include` lista archivos .ts/.tsx aunque ningún test los cargue (ignora .gitkeep y CSS). Con apps/web/src/app/page.tsx placeholder (0 %), `pnpm test:coverage` sale con código 1 hasta que T-24 lo implemente y lo pruebe.
- En el entorno jsdom de Vitest, `fetch('/api/health')` relativo funciona bajo MSW (handler `*/api/health`), y `AbortSignal.timeout` / `AbortController` con fetch también. HeroUI (`Chip`) y `@testing-library/jest-dom/vitest` cargan sin configuración extra.
- `'@polleria/shared'` se resuelve por el enlace del workspace y también como auto-referencia desde packages/shared/tests; no hace falta alias.

**Why:** evita detenerse por avisos benignos y reabrir decisiones ya verificadas.
**How to apply:** al tocar vitest.config.ts o instalar dependencias, partir de estos hechos y volver a verificar solo si cambian las versiones del ADR 0001.
