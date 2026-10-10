# Cómo continuar el desarrollo — Sistema Pollería

Documento de traspaso para retomar el trabajo en una conversación nueva. Lo mantiene el orquestador.
Corte: 2026-10-09. Complementa (no reemplaza) a CLAUDE.md y docs/PROGRESS.md.

## Actualización de esta copia en Devin (prioridad sobre el traspaso histórico de abajo)

- La 003 está INTEGRADA a main (merge 80340c3) y la 004 (gestión de usuarios por el administrador) también (merge 35334d6, 2026-10-08): spec aprobada, 27 AC, TDD, 53 adversariales con 9 hallazgos corregidos (abiertos 0), reviewer APROBADO, verificación del orquestador completa (pnpm test 1036+7 esperadas, lint, typecheck, cobertura y E2E 16/16 en verde).
- La 005 (productos y precios de la carta) está INTEGRADA a main (merge 2af8023, 2026-10-08): spec aprobada con 10 recomendaciones, 15 AC, TDD (113 casos nuevos en rojo), implementación de dominio + API (sin pantallas), 33 adversariales con 2 hallazgos corregidos y revalidados (abiertos 0; 3 huecos documentados como deuda), reviewer APROBADO, verificación del orquestador completa (pnpm test 1207+7 esperadas, lint, typecheck, cobertura con código 0 y E2E 16/16 en verde; OpenAPI 0.5.0 validado con Redocly).
- La 004 documenta la Aclaración 1: '/admin' se guarda en localStorage pero NO es puesto de trabajo (el aterrizaje directo y el usuario recordado solo aplican a /mozo, /caja, /cocina).
- Verificación FINAL del orquestador: pnpm test y pnpm test:coverage pasan con 786 pruebas aprobadas + 7 fallas esperadas autorizadas (793); líneas globales 98,12 %, shared 97,36 %, services/auth 98,46 % y services/users 91,66 %. Lint, tipos e instalación congelada pasan. E2E: 14 aprobados y 2 no aplicables, incluidos los recorridos nuevos de la 003.
- El principal escribió ese trabajo inicialmente sin subagentes, aunque comprobó el rojo antes del verde. El usuario corrigió el proceso: desde ahora se exige el equipo de docs/agents/ con SDD, TDD y pruebas adversariales. No atribuir retrospectivamente la implementación inicial al equipo.
- Configuración nativa añadida en .devin/agents/ y .devin/rules/orquestacion-sdd-tdd.md. El principal actúa como orquestador y no escribe producción ni tests. Usar perfiles disponibles con las instrucciones del rol si los perfiles personalizados aún no aparecen en la sesión.
- El spec-writer confirmó coherencia documental. El test-writer auditó y reforzó los 44 AC: 193 casos de la 003 en verde y E2E 14 pasan/2 no aplicables, sin editar producción. También aisló la preparación E2E en Node nativo para resolver el conflicto del cargador Playwright/Sequelize, conservando guardias de datos.
- El adversarial-tester añadió 35 casos: 32 verdes y 3 rojos en dos hallazgos medios (ADV-003-06 y ADV-003-14). Críticos/altos: 0 en esa auditoría. El usuario aprobó corregir ambos; el spec-writer aclaró spec/tasks sin ampliar los 44 AC.
- Backend-dev y frontend-dev corrigieron los dos hallazgos en archivos disjuntos, con rojo antes y verde después y sin editar pruebas. El adversarial-tester revalidó y amplió casos: 44/44 propios en verde, hallazgos abiertos 0. Reviewer independiente: APROBADO, sin bloqueantes; el orquestador repitió personalmente las verificaciones en serie.
- Integraciones 003 y 004: autorizadas y hechas (merges 80340c3 y 35334d6). main queda con ambas.
- La 006 (presentaciones y partes del pollo en octavos) está INTEGRADA a main (merge 4afbc66, 2026-10-09): spec aprobada con 6 recomendaciones, 14 AC, TDD (141 pruebas nuevas en rojo), tabla product_portions + chickenConsumption + GET/PUT /api/products/{id}/portions, 28 adversariales con 3 altos + 1 bajo corregidos y revalidados (abiertos 0; observaciones bajas documentadas como deuda en PROGRESS.md), reviewer APROBADO, verificación del orquestador completa (pnpm test 1376+7 esperadas, lint, typecheck, cobertura código 0 —global 98,35 %, shared 99,04 %, services/products 95,89 %— y E2E 16/16; OpenAPI 0.6.0 validado con Redocly).
- Integraciones 003, 004, 005 y 006: autorizadas y hechas (merges 80340c3, 35334d6, 2af8023 y 4afbc66). main queda con las cuatro.
- La 007 (combos) está INTEGRADA a main (merge 892914a, 2026-10-09): spec aprobada con 10 recomendaciones, 15 AC, TDD (~150 pruebas nuevas en rojo), categoría 'combo' + tabla combo_items + comboChickenConsumption + GET/PUT /api/products/{id}/items con reemplazo atómico serializado (FOR NO KEY UPDATE desde el diseño), 30 adversariales con 0 hallazgos (10 observaciones como deuda), reviewer APROBADO, verificación del orquestador completa (pnpm test 1549+7 esperadas, lint, typecheck y E2E 16/16 en verde; cobertura global 98,47 % —verificada por el reviewer sobre el mismo árbol—; OpenAPI 0.7.0 validado con Redocly).
- Integraciones 003 a 007: autorizadas y hechas (merges 80340c3, 35334d6, 2af8023, 4afbc66 y 892914a). main queda con las cinco.
- La 008 (pantallas de administración de la carta) está INTEGRADA a main (merge 01d23bb, 2026-10-09): spec aprobada con 10 recomendaciones, 21 AC, TDD (rojo por módulos ausentes; 4 defectos de pruebas corregidos por el test-writer), money.ts en shared + pantallas /admin/carta (lista, alta, edición con grilla de presentaciones y editor de componentes con comparación de precios), 157 tests adversariales verdes con 9 hallazgos corregidos y revalidados (1 alto: crash por cantidad Infinity; abiertos 0), reviewer APROBADO, verificación completa (pnpm test 1866+7 esperadas — una corrida del orquestador dio 3 timeouts de findByRole bajo ~97 workers que pasan aislados, flake documentado—, lint, typecheck, cobertura código 0 —global 98,5 %, shared 99,35 %— y E2E 20/20 con los 4 recorridos nuevos; OpenAPI 0.7.0 intacto porque la 008 solo consume el contrato; apps/api sin diff).
- Integraciones 003 a 008: autorizadas y hechas (merges 80340c3, 35334d6, 2af8023, 4afbc66, 892914a y 01d23bb). main queda con las seis; la Fase 1 está completa en código.
- Próxima acción: punto de control de cierre de la Fase 1 con el usuario (confirmar pendientes manuales: `pnpm db:migrate` en polleria_dev aplica las migraciones de 005/006/007, recorrido real de /admin/carta y datos reales de la carta); luego el spec-writer prepara la propuesta de la primera funcionalidad de la Fase 2 (pedidos/mesas) en una rama feat/009-*.
- Seguridad: nunca tocar polleria_dev. El usuario autorizó limpiezas solo de users, sessions, SequelizeMeta, SequelizeData, fixture_a, fixture_b, fixture_seed_rows, FixtureMeta y FixtureData en polleria_test, con guardias. No crear/borrar bases ni roles. Serializar Vitest, cobertura y Playwright y asignar turnos exclusivos de la base a los subagentes.
- Pendientes MANUALES: R-003-06 (PIN oculto y Ctrl+C en PowerShell real), celular del local sin internet y versión real de Chrome; se documentan conforme a T-21/T-26 y no se sustituyen con E2E. No se han migrado polleria_dev ni creado administradores reales. CLAUDE.md ya registra bcrypt y users:create-admin.
- Pendientes MANUALES de la 005: el usuario debe ejecutar `pnpm db:migrate` en polleria_dev (aplica 20261008180000-create-products) y, con pnpm dev y una cookie polleria_session, probar: POST de un producto como admin → 201; GET sin cookie → 401; PATCH de precio e isActive; duplicado con otra capitalización → 409 'Ya existe un producto con ese nombre.'; priceCents 185000 → error de rango; POST como mozo → 403 'No tienes permiso para realizar esta acción.'.
- Pendientes MANUALES de la 006 (spec §18): el usuario debe ejecutar `pnpm db:migrate` en polleria_dev (aplica 20261009120000-create-product-portions.ts) y, con pnpm dev y la cookie polleria_session de un admin, probar: POST producto 'chicken' → 201; PUT /api/products/{id}/portions con la grilla → 200; GET ordenada (sin cookie → 401); PUT con portions:[] → lista vacía; half con cut 'leg' → 400 'La parte no corresponde...'; PUT en producto de otra categoría → 409 'Solo los productos de la categoría Pollo pueden tener presentaciones.'; PATCH de category con filas cargadas → 409 'Este producto tiene presentaciones de pollo; quítalas antes de cambiar su categoría.'; PUT como mozo → 403.
- Pendientes MANUALES de la 007 (spec §18): `pnpm db:migrate` en polleria_dev (aplica 20261009180000-create-combo-items.ts, que también amplía el CHECK de categorías) y, con pnpm dev y la cookie polleria_session de un admin, probar: POST /api/products `{ name: 'Mostrito', category: 'combo', priceCents: 2200 }` → 201; PUT /api/products/{id}/items con pollo (quarter, leg) + chaufa → 200 con el producto embebido; GET con sesión de mozo → 200 (sin cookie → 401); PUT sobre un 'dish' → 409 COMBO_ITEMS_NOT_ALLOWED; componente 'combo' → 400 con su issue; PATCH `{ category: 'dish' }` sobre el combo → 409 PRODUCT_HAS_ITEMS; PUT `{ items: [] }` y reintentar → 200.
- Pendientes MANUALES de la 008 (spec §18): sin migraciones nuevas (la 008 no toca la API). Con pnpm dev y la cookie de un admin, recorrer /admin/carta: crear un producto no-pollo → vuelve a la lista; crear un 'chicken' → va a su edición y cargar la grilla de presentaciones; crear un 'combo' y armar sus componentes viendo la comparación de precios; desactivar un producto con la confirmación y reactivarlo; errores 409 reales (cambiar la categoría de un pollo con presentaciones y de un combo con componentes); todo también a 360 px sin desplazamiento horizontal.
- Pendientes MANUALES de la 004 (spec §17): con pnpm dev, como administrador en /admin → Usuarios: crear un mozo y verlo en la lista; rechazo de PIN '1234' y username repetido; el mozo entra con su PIN a /mozo; cambio de roles (mozo → cajero solo entra a Caja); restablecer PIN (su sesión muere y entra con el nuevo); desactivar (sale de /login) y reactivar (vuelve con el último PIN); el único admin no puede quitarse el último rol admin; probar a 360 px sin desplazamiento horizontal.
- Redocly CLI 1.34.5 exacta validó OpenAPI 0.3.1 con código 0 y 11 advertencias admitidas por R-003-08; no se añadió al proyecto. devin doctor validó los siete perfiles mediante el ejecutable instalado (no está en PATH), y no quedaron servidores de prueba activos.

El resto de este documento conserva el traspaso original como referencia histórica y técnica.

## 1. Resumen en 30 segundos

- Fase 0 (base del proyecto): TERMINADA, integrada a main y aprobada por el usuario.
  - 001-base-monorepo: monorepo pnpm, API Express + Sequelize + PostgreSQL, web Next.js + HeroUI + Tailwind, GET /api/health, pantalla "Conectado", migraciones con umzug, guardia de base de pruebas.
  - 002-printer-service: PrinterService con driver file (tmp/comandas), normalización de texto a 48 columnas, comando pnpm printer:test.
- Fase 1 (usuarios y carta): EN CURSO.
  - 003-users-pin-login: spec APROBADA (con revisión 1: varios roles por persona). Rama feat/003-users-pin-login. Todavía no hay código ni tests de la 003.
  - Siguiente acción: delegar a backend-dev la tarea T-01 (instalar bcrypt) y luego a test-writer los tests en rojo.
- Estado de main: Vitest 549 pasan + 7 fallas esperadas (deuda autorizada con it.fails) de 556; E2E 7 pasan + 1 omitido por diseño; lint y typecheck en 0; cobertura de líneas ~98 %.

## 2. Primeros pasos en la conversación nueva (orquestador)

1. Leer CLAUDE.md (se carga solo), este archivo, docs/PROGRESS.md y `git log --oneline -20`.
2. Confirmar la rama: `git branch --show-current` debe dar feat/003-users-pin-login y `git status --short` debe estar limpio.
3. Verificación rápida (opcional pero recomendada): `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (deben dar 549 pasan + 7 fallas esperadas mientras no haya tests de la 003).
4. Dar al usuario el REPORTE DE AVANCE (formato en .claude/agents/orquestador.md) con el estado y el próximo paso.
5. Continuar con la sección 3.

## 3. Estado exacto y siguiente acción

Funcionalidad 003-users-pin-login, paso 4 de 9 del ciclo. Documentos:
- Spec: docs/specs/003-users-pin-login/spec.md (Aprobada; 44 AC; sección 19 resume la revisión 1).
- Tareas: docs/specs/003-users-pin-login/tasks.md (T-01 a T-28).
- Contrato: docs/api/openapi.yaml versión 0.3.1 (rutas /auth/users, /auth/login, /auth/me, /auth/logout).
- ADR: docs/decisions/0002-sesion-pin-y-limite-de-intentos.md (Aceptado).

Orden de trabajo que falta (ver "Orden y por qué" en tasks.md):
1. T-01 (backend-dev, solo configuración): `pnpm --filter @polleria/api add bcrypt@6.0.0` y `add -D @types/bcrypt@6.0.0`; en pnpm-workspace.yaml agregar `ignoredBuiltDependencies: [bcrypt]` (no onlyBuiltDependencies; bcrypt trae binario para win32-x64). Verificar que carga con un script en el scratchpad. Commit `feat(003): instala bcrypt para el PIN`. El orquestador verifica después: install --frozen-lockfile, lint, typecheck, test.
2. T-02 a T-14 y T-27 (test-writer): tests en rojo de los 44 AC. Incluye ajustar el helper de limpieza de la base (users y sessions; sección 12 de la spec). Cada archivo con `describe('003: ...')`.
3. T-15 (backend-dev) primero: esquemas Zod de usuarios, roles y sesión en packages/shared (frontend-dev los necesita y no puede tocar shared).
4. En paralelo: backend-dev T-16 a T-21 (migraciones users con roles VARCHAR(16)[] y sessions, bcrypt, token de sesión, límite de intentos, requireAuth/requireRole, rutas /api/auth, servicio de usuarios, comando pnpm users:create-admin) y frontend-dev T-22 a T-24 y T-28 (cliente HTTP lib/api, /login con lista de nombres y teclado de PIN, guardia por rol, /mozo, /caja, /cocina, /admin, /areas "¿Dónde vas a trabajar?", "Cambiar de área", "Cerrar sesión").
5. T-25 (frontend-dev): E2E en verde (necesita el backend terminado).
6. T-26: verificación final. Luego pasos 6 a 9 del ciclo: adversarial-tester, reviewer, definición de terminado, PROGRESS.md y permiso del usuario para integrar a main con `git merge --no-ff`.
7. Al cerrar la 003: registrar en CLAUDE.md bcrypt 6.0.0, @types/bcrypt 6.0.0 y el comando pnpm users:create-admin; marcar la 003 como cerrada en PROGRESS.md.
8. Después de integrar la 003, el usuario crea su administrador con `pnpm db:migrate` y `pnpm users:create-admin` (en PowerShell, para que el PIN no se vea).

Decisiones aprobadas de la 003 (detalle en la spec y en PROGRESS.md):
- Sesión: token aleatorio de 32 bytes en la cookie `polleria_session` (HttpOnly, SameSite=Strict, Path=/, sin Secure porque el local usa http://IP), y la base guarda solo su SHA-256 en la tabla sessions. Sin JWT y sin variables de entorno nuevas. Duración fija de 16 h. Logout borra la fila.
- PIN de 4 a 6 dígitos, bcrypt costo 10. Límite: 5 intentos fallidos bloquean al usuario 15 min (por usuario y en memoria, no por IP: el rewrite de Next no pasa la IP del celular).
- /login muestra una lista de usuarios activos (nombre, sin rol) y un teclado numérico; el equipo recuerda el último usuario.
- Varios roles por persona (users.roles, arreglo con CHECK de no vacío, sin repetidos y solo waiter, kitchen, cashier, admin). requireRole deja pasar con al menos uno. El administrador entra a todas las áreas.
- Con una sola área se entra directo; con varias, a la última usada en ese equipo (localStorage polleria:lastArea) o a /areas. Enlace "Cambiar de área" en la barra superior.
- pnpm users:create-admin es interactivo y solo crea administradores; asignar otros roles es de la 004.

## 4. Mapa del repositorio

- CLAUDE.md: constitución (reglas, glosario, versiones exactas, comandos). Leer siempre.
- .claude/agents/: definiciones del orquestador y de los 6 subagentes. .claude/agent-memory/<agente>/: memoria de proyecto de cada subagente (se versiona; el orquestador la commitea con prefijo docs).
- docs/planificacion.md: requerimientos originales (RF, RNF, historias).
- docs/PROGRESS.md: estado, tabla de funcionalidades, decisiones del usuario, deuda, bloqueos.
- docs/specs/001-base-monorepo, 002-printer-service, 003-users-pin-login: spec.md y tasks.md de cada funcionalidad.
- docs/decisions/0001-stack-y-versiones.md y 0002-sesion-pin-y-limite-de-intentos.md: ADR (ambos Aceptados).
- docs/api/openapi.yaml: contrato (versión 0.3.1).
- apps/api/src: config/env.ts (loadConfig, CONFIG_VARIABLES), db/ (sequelize.ts, migrator.ts con umzug y bloqueo consultivo, cli.ts, assert-test-database.ts, postgres-url.ts, migrations/, seeders/), errors/, middlewares/ (error-handler, body-reader), services/ (health.service.ts, printer/), controllers/, routes/, app.ts, server.ts, print-test-page.ts.
- apps/api/tests: integración (helpers/, fixtures/, adversarial/).
- apps/web/src: app/ (layout, page, providers), components/server-status.tsx, lib/api/health.ts, config/server-env.ts; apps/web/tests (setup MSW, adversarial).
- packages/shared/src: TIME_ZONE, esquemas de salud y error, ERROR_CODES, toLimaDateTimeParts.
- e2e/home.spec.ts; playwright.config.ts y vitest.config.ts en la raíz.

## 5. Entorno y base de datos (cuidado)

- Windows 11, Git Bash para comandos; Node 24.1.0, pnpm 10.12.1, PostgreSQL 17.5 en localhost:5432 (servicio postgresql-x64-17). Hay un PostgreSQL 18 en el 5433 que NO se usa.
- apps/api/.env existe (lo creó el usuario) con NODE_ENV, HOST, PORT, DATABASE_URL (polleria_dev) y DATABASE_URL_TEST (polleria_test). NUNCA imprimir su contenido ni la clave. Para mirar URLs, enmascarar: `sed -E 's#(postgres(ql)?://[^:/@]+:)[^@]*@#\1****@#g'`.
- Ya pasó una vez que el usuario puso su clave real también en apps/api/.env.example (que se versiona). Si `git status` muestra ese archivo modificado, revisar con la clave enmascarada y restaurarlo (`git checkout -- apps/api/.env.example`) antes de cualquier commit.
- Ningún agente crea, borra ni recrea bases ni roles. Las pruebas usan solo polleria_test; db:migrate y db:seed van sobre polleria_dev.
- Puertos: dev 3000 (web, 0.0.0.0) y 4000 (API, 127.0.0.1); E2E 3100 y 4100. Antes de `pnpm test:e2e` comprobar que estén libres (detener pnpm dev).
- En la shell, `python` abre el acceso directo de Microsoft Store y se cuelga: usar `node -e` para scripts.
- No hay repositorio remoto configurado; todo es local. Integrar a main solo con permiso del usuario y `git merge --no-ff`.

## 6. Cómo trabaja el equipo (prácticas que funcionaron)

- Ciclo por funcionalidad: rama feat/NNN → spec-writer → aprobación del usuario → test-writer (rojo) → backend-dev/frontend-dev (verde) → adversarial-tester → reviewer → definición de terminado → PROGRESS.md → permiso para integrar.
- Los subagentes no ven la conversación: cada encargo lleva ruta de la spec, IDs de tareas, AC, rama, decisiones del usuario, avisos técnicos conocidos y el reporte esperado.
- Si una funcionalidad trae dependencias nuevas o es la base, primero una tarea de instalación o andamiaje (solo configuración) y después los tests en rojo, para que fallen por la razón correcta.
- Los AC se numeran desde AC-01 en cada spec; cada archivo de prueba usa `describe('NNN: ...')` para distinguirlos. Los adversariales usan IDs ADV-NNN-xx en */tests/adversarial/*.adversarial.test.ts.
- Agentes en paralelo: solo si tocan carpetas distintas; commits con rutas explícitas (nunca `git add -A`); nunca dos instalaciones de paquetes a la vez (lockfile).
- Arbitraje: si un implementador dice que un test está mal, el orquestador lo verifica y lo corrige el dueño del test (test-writer o adversarial-tester). Ya pasó una vez (glob sin barra en la 001).
- Hallazgos adversariales medios y bajos: se pregunta al usuario. "Corregir ahora" → enmienda corta de la spec (AC nuevos), tests en rojo, corrección (así se hizo en la 001). "Dejar como deuda" → el adversarial-tester marca sus tests con it.fails y comentario (así se hizo en la 002).
- Verificaciones que el orquestador corre siempre él mismo: pnpm install --frozen-lockfile, pnpm lint, pnpm typecheck, pnpm test, pnpm test:coverage, pnpm test:e2e (puertos libres), y que ningún commit feat/fix/refactor toque tests:
  `git log main..HEAD --format="%h %s" --name-only | awk '/^[0-9a-f]{7} (feat|fix|refactor)/{t=1;h=$0;next} /^[0-9a-f]{7} /{t=0;next} t&&NF{print h" -> "$0}' | grep -E "\.test\.tsx?$|/tests/|^e2e/"` (debe salir vacío).
- La memoria de cada subagente (.claude/agent-memory/) suele quedar sin commit: el orquestador la incluye en su commit docs.
- Commits del orquestador: prefijo docs y línea de atribución Co-Authored-By.

## 7. Trampas técnicas conocidas

- TypeScript 6.0.3 (no 7). La API y shared corren con type stripping de Node 24: solo sintaxis borrable e imports relativos con .ts.
- Vitest 5: proyectos en test.projects; cobertura solo en la raíz; umbrales por glob; it.fails, it.fails.each e it.runIf(...).fails existen.
- Zod 4: `z.string().max(n)` cuenta puntos de código, no unidades UTF-16; usar `.refine(v => v.length <= n)` cuando la spec mida con .length. Zod ejecuta los refine aunque z.url ya falló: proteger con URL.canParse.
- Las herramientas Write/Edit convierten escapes \uXXXX en el carácter real; para U+2028/U+2029 en regex usar String.fromCharCode o new RegExp.
- ESLint prohíbe cualquier llamada `.sync(` en apps/api/src (usar FileHandle.datasync, no sync).
- Next 16.4.0: no permite dos next dev en la misma carpeta; bloquea /_next desde IP en desarrollo salvo WEB_ALLOWED_DEV_ORIGINS; agentRules: false evita que genere AGENTS.md.
- superagent serializa un Buffer como JSON si el Content-Type es JSON (usar el helper sendRawBody de los tests).
- Playwright solo da por listo un webServer con HTTP 200 a 403; si la base no responde, la API da 503 y el E2E espera 120 s.
- pnpm 10: revisar "Ignored build scripts" al instalar; bcrypt va en ignoredBuiltDependencies.
- openapi-typescript sigue diferido (peer typescript ^5); la web tipa con los esquemas Zod de @polleria/shared.

## 8. Preferencias observadas del usuario

- Aprueba casi siempre "con las recomendaciones" y prefiere que el orquestador proponga una opción recomendada en cada pregunta.
- Quiere reportes en el formato REPORTE DE AVANCE, en español sencillo.
- No quiere aprobar de nuevo cambios que no afectan lo que ve el usuario final (el orquestador decide y lo registra).
- Integra a main con commit de merge (--no-ff).
- En la 001 eligió corregir los hallazgos menores; en la 002 eligió dejarlos como deuda. Preguntar cada vez.
- Cambió un supuesto de negocio (varios roles por persona): revisar con cuidado los supuestos de negocio de cada spec antes de mostrarla.

## 9. Preguntas pendientes para el dueño de la pollería

- Marca y modelo de la impresora térmica (para el driver escpos de la Fase 3).
- Versión de Chrome en los celulares de los mozos (se asume 111 o superior).
- ¿Vende 1/8? ¿Cómo arma el 1/2 (pecho + pierna o a elección)? ¿Cobra distinto pecho y pierna? Platos y precios sueltos (el modelo de la 006 ya cubre todas las respuestas).
- Combos: ¿qué combos vende hoy y a qué precio (mostrito, pollo + gaseosa, familiar)? Sirve para el seed de la Fase 6 — el modelo de la 007 ya está decidido. ¿El cliente elige pecho/pierna del pollo del combo al pedir? (decisión de la Fase 2).
- ¿Las cremas se cobran? ¿Descartables para llevar? (quedaron como producto 'extra' aparte) ¿Cuántos vasos rinde una jarra?
- ¿Quién puede anular pedidos? (Fase 2). ¿Qué comprobante emite y en qué régimen? (fuera del prototipo).

## 10. Plan que sigue

- Fase 1 (propuesta, cada una con su spec): 004 gestión de usuarios, 005 productos y precios, 006 presentaciones y octavos, 007 combos — todas cerradas o integradas; 008 pantallas de administración de la carta (siguiente). Al terminar: punto de control de fin de fase con el usuario.
- Fase 2 mesas y pedidos (RF-02 a RF-07), Fase 3 comandas impresas (RF-08 a RF-11; antes corregir ADV-002-02 y revisar ADV-002-01), Fase 4 caja y cobro (RF-13 a RF-17), Fase 5 inventario (RF-20 a RF-24), Fase 6 reportes, auditoría y datos de demostración (RF-25 a RF-27).

## 11. Comandos útiles

- pnpm dev (web 3000 + API 4000) y abrir http://localhost:3000 → "Conectado".
- pnpm test · pnpm test:coverage · pnpm test:e2e (con pnpm dev detenido) · pnpm lint · pnpm typecheck.
- pnpm db:migrate · pnpm db:seed (polleria_dev) · pnpm printer:test (hoja de prueba en tmp/comandas).
- Desde la 003 (cuando esté implementada): pnpm users:create-admin.
