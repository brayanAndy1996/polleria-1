# Scripts

Utilidades de desarrollo y verificación del monorepo:

- `dev.ts`: entrada de `npm run dev`; prepara el PostgreSQL local opcional y
  ejecuta frontend/backend con pnpm, conservando las señales de cierre.
- `local-postgres.ts`: comprueba e inicia el cluster ya preparado según
  `infra/.local/postgres.json`. No crea bases ni ejecuta migraciones o seeds.
- `local-postgres.test.ts`: regresiones del arranque con ejecutores simulados,
  sin conectar a una base de datos.

Los comandos públicos siguen definidos en el `package.json` raíz. Ver
[la guía de frontend](../docs/FRONTEND.md) y [la decisión de instalación local](../docs/decisions/0004-local-postgres-user.md).
