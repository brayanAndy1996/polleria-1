# Tareas — estructura raíz

- [x] S-01: revisar estructura y documentar el alcance autorizado.
- [x] T-01: adaptar rutas de pruebas existentes y comprobar los fallos causales
  que correspondan a la estructura todavía ausente (test-writer).
- [x] I-01: mover aplicaciones, conservar archivos y actualizar configuración,
  workspaces, enlaces del lockfile, rutas y comandos (implementer).
- [x] D-01: actualizar referencias de documentación y guías de frontend.
- [x] R-01: revisar invariancia del backend contra HEAD y verificar el layout.
- [x] V-01: ejecutar instalación congelada, tipos, lint, build y regresiones
  disponibles, documentando límites de entorno.

No ejecutar migraciones o seeds sobre desarrollo; no crear bases ni roles.
No integrar a main sin autorización posterior.

## Evidencia de cierre — 2026-10-16

- Antes de mover, `printer-env.test.ts` adaptado obtuvo 24 aprobadas y tres
  fallos causales por la profundidad todavía antigua. Tras mover y ajustar
  `PROJECT_ROOT_DIR`, las 27 pruebas pasan.
- Se comprobaron los 284 archivos trasladados contra HEAD: ninguno perdido;
  251 mantienen bytes idénticos. Las diferencias de producción corresponden
  únicamente a las rutas documentadas y los extends de TypeScript.
- El contrato OpenAPI solo cambia el texto de ubicación de las aplicaciones.
  El lockfile solo cambia dos importers y dos enlaces a shared, sin versiones
  nuevas. No se modificaron modelos, migraciones ni reglas de negocio.
- La instalación congelada pasa. Mover `node_modules` conservó enlaces scoped
  antiguos que ni la reinstalación normal ni `--force` reemplazaron: se movieron
  únicamente esos directorios generados a un respaldo temporal recuperable y
  se recrearon con `pnpm install --frozen-lockfile`. Los enlaces fueron
  comprobados después; no se tocaron archivos `.env`.
- `pnpm typecheck`, `pnpm lint` y `pnpm build:frontend`: código 0.
- `pnpm exec vitest run --project shared --project api-unit --project web
  --maxWorkers=2`: 85 archivos aprobados, 2025 pruebas aprobadas y tres fallos
  esperados preexistentes; código 0. No incluye integración con PostgreSQL.
- Playwright descubre 40 casos en siete archivos con `--list` y una URL de
  ejemplo validada como `_test`, sin conectar a la base ni iniciar servidores.
  Esto verifica descubrimiento, no ejecución de recorridos.
- Integración con DB, cobertura global y E2E completos no ejecutados: esta
  copia no tiene `backend/.env` ni una base de pruebas configurada. No se
  crearon bases, roles ni datos de desarrollo.
- Revisión del principal; sin reviewer ni auditoría adversarial independientes.
  Trabajo local en `refactor/root-layout`, sin commit, merge ni push.
