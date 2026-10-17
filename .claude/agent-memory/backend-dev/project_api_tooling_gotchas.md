---
name: api-tooling-gotchas
description: Hechos no obvios al implementar backend (umzug 3 + tinyglobby, Zod 4, node --watch, verificación sin base, Windows/Git Bash)
metadata:
  type: project
---

Verificado en T-18 a T-22 (spec 001, 2026-10-07) con Node 24.1.0, umzug 3.8.3, Sequelize 6.37.8, Zod 4.6.5, Express 5.2.1.

- umzug 3 resuelve el glob con tinyglobby (absoluto, barras `/`). Un glob `.../migrations*.ts` (sin `/` antes de `*.ts`) no encuentra nada y no avisa: devuelve `[]`.
- `SequelizeStorage` reutiliza el modelo por `modelName` (default `SequelizeMeta`): para usar varias tablas de registro en la misma instancia, pasar `modelName: tableName`. La tabla se crea sola (`model.sync()`) en la primera llamada a `executed()`, aunque no haya archivos.
- Los `.ts` de migraciones/seeds se cargan con `import(/* @vite-ignore */ pathToFileURL(ruta).href)`; funciona en Node (type stripping) y dentro de Vitest.
- Zod 4: `.default()` recibe el valor de SALIDA (usar `.default(4000)`, no `'4000'`). `.refine(...).transform(Number)` evita el segundo issue porque el pipe se aborta si el refine falla. Un `.min(1)` seguido de `.refine` produce dos issues para la misma variable (por eso loadConfig deja uno por variable).
- Sequelize 6 solo pasa a `pg` un subconjunto de `dialectOptions` (entre ellos `connectionTimeoutMillis`); `database` del query string NO sobrescribe la base.
- `node --watch` (script `dev`) no sale con código 1 si el proceso falla: imprime el error y espera cambios. El código 1 se ve con el script `start`.
- Sequelize sin cerrar mantiene el proceso vivo: en server.ts/cli.ts hacer `await sequelize.close()` y usar `process.exitCode` en lugar de `process.exit()` para no cortar stderr.
- Sin `backend/.env` los tests con base fallan con el mensaje del helper (esperado). Para verificar migrator.ts sin Postgres: script Node con un Sequelize falso en memoria y/o un config de Vitest en el scratchpad (`root` = repo, `globals: true`, `server.fs.strict: false`, sin importar `vitest/config`) para no crear archivos de test en el repo.
- Git Bash: `python - <<EOF` se queda esperando stdin; para editar usar la herramienta Edit. Un heredoc con `'\\'` pierde la barra: usar `String.fromCharCode(92)`.
- Enmienda 1 (T-31 a T-34, verificado 2026-10-07 con body-parser 2.3.0, raw-body 3.0.2): los errores del lector tienen `type` `entity.parse.failed`, `entity.too.large`, `encoding.unsupported`, `charset.unsupported`; la descompresión corrupta y `request.aborted` NO traen `type` útil, solo `status` 400 (http-errors lo pone). Por eso `createBodyReader` (middlewares/body-reader.ts) envuelve el error en `BodyReaderError` y el errorHandler solo clasifica esa clase.
- Sequelize 6 con la forma de objeto `new Sequelize({ host, port, ... })` no lee la query; con URL copia toda la query a dialectOptions y `?host=` pisa el host. pg con `ssl: false` ignora PGSSLMODE. Un `%` mal escapado en la clave hace que `decodeURIComponent` falle: `getPostgresConnectionParts` lo trata como URL inválida, pero loadConfig (sin cambios por spec) la acepta; createSequelize lanza al arrancar (edge reportado, sin arreglar).
- Bloqueo de migraciones: transacción no administrada `sequelize.transaction()` + `query('SELECT pg_advisory_xact_lock($1)', { bind: [clave], transaction })`; umzug corre fuera de esa transacción porque no hay CLS. Rollback en finally con `.catch(() => undefined)`.
- `pnpm exec vitest run` no detecta errores de tipos: correr `pnpm --filter @polleria/api run typecheck` y `prettier --check` (parte de `pnpm lint`) antes de cada commit. `Reflect.get(obj, prop)` evita el error TS7053 de `prop in obj` con uniones de literales.
- Cobertura solo de API y shared: `vitest run --coverage --project shared --project api-unit --project api-integration --coverage.reportsDirectory=<scratchpad> --coverage.reporter=json-summary` y sumar líneas por carpeta (el umbral global falla porque excluye frontend).
- Al commitear en paralelo con frontend-dev: `git commit -m ... -- <rutas>` (solo esas rutas, aunque el índice tenga más).

**Why:** ahorra redescubrir estos comportamientos al tocar migraciones, configuración o arranque de la API.
**How to apply:** consultar antes de cambiar migrator.ts, cli.ts, server.ts o loadConfig.
