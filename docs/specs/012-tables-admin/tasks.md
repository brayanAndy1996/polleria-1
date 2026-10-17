# Tareas — Spec 012: Pantalla de administración de mesas

- Spec: docs/specs/012-tables-admin/spec.md (Aprobada por el usuario el 2026-10-12 con las 7 respuestas recomendadas del §17)
- Rama: feat/012-tables-admin
- Contrato: docs/api/openapi.yaml 0.9.0, SIN CAMBIOS (la spec es solo web; consumo de las rutas de la 009)
- ADR: ninguno — composición de lo ya decidido
- Dependencias: ninguna nueva
- Alcance especial: solo frontend (+ e2e/tables-admin.spec.ts). backend y packages/shared no se tocan: ni código, ni pruebas (RN-012-01, D-012-01, D-012-10). Si apareciera un hueco real en la API se reporta al orquestador como tarea de backend separada — no se improvisa (pregunta 7 de la spec).
- Cambios señalados: lib/api/tables.ts suma createTable y updateTable junto a las funciones de la 011; app/admin/page.tsx suma el enlace 'Mesas'; nace app/admin/mesas/page.tsx.

## Orden y por qué

TDD de la 008/011: el test-writer va primero y deja el rojo comprobado (funciones de la lib que no existen, página ausente o 404, E2E de una ruta que no existe). El frontend-dev verde luego. Backend solo si un hueco real lo exige (ninguno previsto — la API de la 009 ya cubre todo). Cierre con la verificación completa.

## Pruebas en rojo (test-writer) — reglas comunes

- Las pruebas unitarias y de componentes corren con `pnpm test` (Vitest + MSW a nivel fetch); el E2E con `pnpm test:e2e` en el proyecto mobile-chrome (360×740) sobre polleria_test. NUNCA `pnpm --filter` para correr tests: las suites se serializan sobre la misma base.
- Cada prueba lleva su AC en el nombre: `describe('012: ...')` / `it('AC-xx: ...')`. Toda validación de rojo es: la función/página no existe aún — el fallo es por ausencia, nunca por una aserción inventada.
- MSW intercepta `/api/...` del mismo origen y verifica método, ruta y cuerpo. Los esquemas de shared ya existen (createTableRequestSchema, updateTableRequestSchema, tableSchema, tablesResponseSchema).
- polleria_test: la limpieza del salón ya autorizada usa `clearOrderTables` (D-010-19); las semillas de mesas van por `createTableService` con las guardias `_test` de siempre. Sesiones por `loginWithCookie` con los usuarios E2E sembrados (e2e.admin PIN 135790; e2e.mozo PIN 2468 para la verificación del tablero si aplica).
- La semilla E2E vigente (usuarios, carta, 'E2E Mesa 1' a 'E2E Mesa 4' de la 011) se conserva; no se esperan cambios en e2e/global-setup.ts.
- Commits `test:` solo con archivos de prueba. Nada de código de producción.

## Tareas

### T-01 — Tests de las funciones nuevas de `lib/api/tables.ts` (AC-01)
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-01
- Descripción: ampliar `frontend/src/lib/api/tables.test.ts` — MSW sirve `POST /api/tables` (201 con `tableSchema`) y `PATCH /api/tables/{id}` (200) para `createTable(name)` y `updateTable(tableId, { name } / { isActive })`. Verifica método+ruta+cuerpo exacto, validación por esquema, propagación de ApiError con sus códigos (TABLE_NAME_TAKEN, TABLE_HAS_OPEN_ORDER, TABLE_NOT_FOUND, VALIDATION_ERROR) y UNEXPECTED_RESPONSE conservando el status. Las pruebas de la 011 siguen verdes intactas.

### T-02 — Tests de la lista y la navegación /admin/mesas (AC-02, AC-03, AC-04)
- Responsable: test-writer
- Dependencias: T-01
- AC: AC-02, AC-03, AC-04
- Descripción: `frontend/src/app/admin/mesas/page.test.tsx` con MSW — una fila por mesa (activas e inactivas, orden recibido) con nombre, etiqueta del estado derivado en las activas (Libre/Ocupada/Pedido listo/Pidió la cuenta), 'Desactivada' sin etiqueta en las inactivas, y 'Renombrar' + 'Desactivar'/'Activar' por fila; 'Cargando mesas...' (role status), 'No se pudo cargar la lista de mesas.' (role alert) + 'Reintentar', 'Todavía no hay mesas.'; el enlace 'Mesas' en /admin; RoleGuard lleva a un mozo a /mozo y deja pasar al admin; la pantalla no ofrece acciones del ciclo del pedido.

### T-03 — Tests del alta y el renombrado (AC-05, AC-06, AC-07, AC-08)
- Responsable: test-writer
- Dependencias: T-02
- AC: AC-05, AC-06, AC-07, AC-08
- Descripción: alta — 'Nombre de la mesa' + 'Agregar mesa' envía un solo POST `{ name }` aunque se toque dos veces, tras el 201 la mesa aparece y el campo queda limpio; nombre inválido cortado en local por tableNameSchema con su mensaje junto al campo; 409 TABLE_NAME_TAKEN muestra 'Ya existe una mesa con ese nombre.' conservando el borrador; fallo de red con 'Sin conexión con el servidor. Revisa el wifi e intenta de nuevo.'. Renombrar — diálogo 'Renombrar mesa' con el nombre precargado, 'Guardar' inhabilitado sin cambios, PATCH `{ name }` → 200 → fila con el nombre nuevo; TABLE_NAME_TAKEN con su mensaje y la fila intacta; renombrar ocupada responde 200; 404 'Esa mesa no existe.'.

### T-04 — Tests de activar y desactivar (AC-09, AC-10)
- Responsable: test-writer
- Dependencias: T-02
- AC: AC-09, AC-10
- Descripción: 'Desactivar' abre '¿Desactivar <nombre>? No aparecerá en el tablero del mozo.' con 'Sí, desactivar' y 'Cancelar' → PATCH `{ isActive: false }` → fila 'Desactivada' con 'Activar'; 'Cancelar' no envía; 409 TABLE_HAS_OPEN_ORDER muestra 'La mesa tiene un pedido abierto; ciérralo o muévelo antes de desactivarla.' y la fila sigue activa; 'Activar' envía PATCH `{ isActive: true }` sin confirmación → fila activa con 'Libre'.

### T-05 — Recorrido E2E mobile-chrome (AC-11)
- Responsable: test-writer
- Dependencias: T-03, T-04
- AC: AC-11
- Descripción: `e2e/tables-admin.spec.ts` en mobile-chrome (360×740) sobre polleria_test — el admin E2E entra a /admin/mesas por el enlace 'Mesas', agrega una mesa por la interfaz, la renombra, la desactiva con la confirmación ('Desactivada' sin etiqueta de estado), la reactiva, y un alta repetida con otras mayúsculas muestra 'Ya existe una mesa con ese nombre.'; sin desplazamiento horizontal (la técnica de la 008/011).

### Verificación del rojo (test-writer)

Tras T-01 a T-05, correr `pnpm test` y `pnpm test:e2e` serializados y adjuntar al reporte la salida que muestra los fallos por ausencia (funciones inexistentes, página 404, ruta sin contenido). Nada de verde todavía.

### Implementación en verde (frontend-dev) — reglas comunes

- No crea, modifica ni elimina pruebas. Si una parece incorrecta, la reporta al orquestador.
- Solo frontend + lo estrictamente señalado (lib/api/tables.ts, app/admin/mesas/, el enlace en app/admin/page.tsx). backend y packages/shared quedan sin diff.
- Reutiliza los patrones de la 008/011: TanStack Query con retry:false, apiErrorMessage/issuesFromApiError/uniqueMessages, RoleGuard con su marco, min-h-12, TABLE_STATE_LABELS de menu-labels.ts, useRef+isPending para envío único, diálogos y confirmaciones del patrón /admin.
- Commits `feat:` sin archivos de test.

### T-06 — Lib de API: createTable y updateTable (verde T-01)
- Responsable: frontend-dev
- Dependencias: T-01 en rojo
- AC: AC-01
- Descripción: `frontend/src/lib/api/tables.ts` suma `createTable(name)` (POST, expectedStatus 201, tableSchema) y `updateTable(tableId, changes)` (PATCH, 200, tableSchema) con las firmas que los tests esperan; las funciones de la 011 quedan intactas.

### T-07 — Pantalla /admin/mesas completa (verde T-02 a T-04)
- Responsable: frontend-dev
- Dependencias: T-06
- AC: AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10
- Descripción: `app/admin/mesas/page.tsx` ('use client', RoleGuard area '/admin') con el alta en línea, la lista de filas con nombre + etiqueta de estado/'Desactivada' + acciones, el diálogo 'Renombrar mesa' y la confirmación de desactivar; estados cargando/error/vacío; invalidación de la lista tras cada mutación; el enlace 'Mesas' en `app/admin/page.tsx`; componentes internos donde el implementador decida.

### T-08 — Cierre: definición de terminado y verificación manual
- Responsable: orquestador (verifica; no implementa)
- Dependencias: T-07
- AC: R-012-01 a R-012-07
- Descripción: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm test:e2e` y `pnpm test:coverage` en verde (80 % líneas en frontend); `git status --porcelain backend packages/shared` vacío; openapi.yaml en 0.9.0 sin diff; grep sin recursos de internet; /admin/mesas bajo RoleGuard '/admin' sin acciones del ciclo. Verificación manual de la spec §18 (alta, renombrar, nombre repetido, desactivar libre/ocupada, reactivar, a 360 px y en la PC). ADV-007-27 y ADV-002-01 quedan como baseline ruidosa conocida — no pertenecen a esta spec.

## Matriz AC, pruebas e implementación

| AC | Prueba (T) | Implementación (T) |
| --- | --- | --- |
| AC-01 | T-01 | T-06 |
| AC-02, AC-03, AC-04 | T-02 | T-07 |
| AC-05, AC-06, AC-07, AC-08 | T-03 | T-07 |
| AC-09, AC-10 | T-04 | T-07 |
| AC-11 | T-05 | T-07 (e2e) |
| R-012-01 a R-012-07 | — | T-08 |
