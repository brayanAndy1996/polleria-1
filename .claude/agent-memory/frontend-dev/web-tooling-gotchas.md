---
name: web-tooling-gotchas
description: Efectos secundarios no obvios de next dev, HeroUI v3, Next config y Playwright en este monorepo (Windows, pnpm)
metadata:
  type: project
---

- `next dev` (Next 16.4.0) creaba `apps/web/AGENTS.md` al detectar un agente de IA. Resuelto en la spec 001 T-23: `agentRules: false` en next.config.ts. Si el archivo reaparece, borrarlo y no commitearlo.
- HeroUI v3: globals.css es `@import 'tailwindcss'; @import '@heroui/styles';`. No hay Provider. Su `--font-sans` ya es una pila de fuentes del sistema (sin recursos externos).
- HeroUI v3 `Chip`: es un `span` que acepta role/aria-*; tamaño `lg` es text-sm, así que para texto de 18 px se pasa `text-lg` en className (sí gana). `variant="soft"` con color success/warning/danger da contraste 4.8 a 5.5:1 medido en Chromium. Para que el texto largo no desborde a 360 px: `max-w-full whitespace-normal text-center`.
- next.config.ts puede importar `./src/config/x.ts` con extensión .ts (probado en `next build` y `next dev`). ESLint exige que `rewrites()` no sea `async` sin await: devolver `Promise.resolve([...])`. Los rewrites se calculan al compilar: en producción, API_INTERNAL_URL debe estar definida durante `next build`.
- pnpm 10.12.1 en este repo: `pnpm ignored-builds` da "None" con Next/HeroUI/Tailwind 4/Playwright; no hace falta onlyBuiltDependencies.
- Playwright no define NODE_ENV en sus procesos; en el webServer de la web se fija NODE_ENV=development por seguridad. Los webServer funcionan en Windows con `node ...` y `pnpm exec next dev --port 3100` (cwd apps/web) y liberan los puertos al terminar.
- Para probar playwright.config.ts o la pantalla sin API real: usar el scratchpad de la sesión (no la raíz del repo) con un stub HTTP de /api/health en un puerto aparte (4299) y `next dev --port 3299` con API_INTERNAL_URL apuntando al stub; un script que importe `@playwright/test` con `createRequire` desde la raíz permite medir fuente, contraste y scrollWidth. Detener procesos con `netstat -ano | grep :PUERTO` y `taskkill //PID n //T //F`.
- Playwright 1.64 da por listo un webServer solo con HTTP 200 a 403. Si la API responde /api/health 503 (sin acceso a la base), `pnpm test:e2e` espera 120 s y falla con "Timed out waiting 120000ms from config.webServer" sin más pista: no es un fallo del config. Para ver los E2E sin base: config temporal en el scratchpad (con `package.json` `{"type":"module"}` al lado, porque el config usa import.meta.dirname) que importa playwright.config.ts y reemplaza el webServer de la API (`port: 4100` o un stub de /api/health con 200). Con el stub, AC-29 a AC-32 pasan en ambos proyectos.
- playwright.config.ts importa `./apps/api/src/db/assert-test-database.ts` directo (Playwright transpila el .ts, con extensión). La guardia lanza UnsafeTestDatabaseError en español sin URL ni clave; el stack trace que imprime Playwright tampoco las contiene.
- Trabajo en paralelo con backend-dev: su índice de git puede tener archivos preparados. Commitear con `git add <rutas>` y luego `git commit -m ... -- <mismas rutas>` para no arrastrar lo suyo.
- Zod 4: un `.refine` encadenado a `z.url()` se ejecuta aunque `z.url` ya haya fallado; protegerlo con `URL.canParse` (y comprobar el protocolo) para no sumar un segundo error. `.default(x).transform(...)` transforma también el valor por defecto.
- Cobertura de la web: `pnpm exec vitest run --project web --coverage` muestra solo las filas de apps/api (0 %) porque oculta los archivos al 100 %, y falla los umbrales globales por eso. Para ver apps/web/src: añadir `--coverage.reporter=json-summary --coverage.skipFull=false` y leer coverage/coverage-summary.json (coverage/ está ignorado por git).
