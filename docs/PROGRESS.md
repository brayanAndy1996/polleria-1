# Progreso del proyecto — Sistema Pollería

Lo mantiene el orquestador. Se actualiza al final de cada paso del ciclo.

## Estado actual

- Fase: 1 de 6, usuarios y carta (RF-01, RF-18, RF-19; RNF-09, RNF-10). Fase 0 cerrada y aprobada por el usuario el 2026-10-08.
- Funcionalidad: 003-users-pin-login.
- Paso: 2 de 9, redacción de la spec 003 (spec-writer).
- Rama: feat/003-users-pin-login.

## Tabla de funcionalidades

| ID | Nombre | Fase | Estado | Rama | Fecha de cierre |
| --- | --- | --- | --- | --- | --- |
| 001 | base-monorepo (monorepo, herramientas, conexión a BD, GET /api/health, web mínima) | 0 | Cerrada (APROBADO; 2 vueltas) | feat/001-base-monorepo | 2026-10-07 |
| 002 | printer-service (PrinterService con driver file) | 0 | Cerrada (APROBADO; 1 vuelta; 5 hallazgos como deuda) | feat/002-printer-service | 2026-10-08 |
| 003 | users-pin-login (usuarios, roles, login con PIN, sesión, requireRole) | 1 | En spec | feat/003-users-pin-login | — |
| 004 | (propuesta) gestión de usuarios por el administrador | 1 | Pendiente | — | — |
| 005 | (propuesta) productos y precios de la carta | 1 | Pendiente | — | — |
| 006 | (propuesta) presentaciones y partes con consumo en octavos (RF-19) | 1 | Pendiente | — | — |
| 007 | (propuesta) combos | 1 | Pendiente | — | — |
| 008 | (propuesta) pantallas de administración de la carta | 1 | Pendiente | — | — |

## Decisiones del usuario

| Fecha | Decisión |
| --- | --- |
| 2026-10-07 | Iniciar la Fase 0. |
| 2026-10-07 | Spec 001 aprobada con las recomendaciones del orquestador. |
| 2026-10-07 | API con prefijo /api, mismo origen que la web vía rewrites de Next.js, sin CORS. La API escucha solo en 127.0.0.1. |
| 2026-10-07 | Dependencias de soporte de la spec 001 aprobadas, incluidas las opcionales eslint-plugin-react-hooks y @testing-library/jest-dom (ADR 0001 aceptado). |
| 2026-10-07 | Códigos de error en inglés (por ejemplo INSUFFICIENT_STOCK); mensajes en español. Se corrigió backend-dev.md. |
| 2026-10-07 | Se mantiene Node 24.1.0 (jsdom 29.1.1). |
| 2026-10-07 | Para correr los E2E hay que detener pnpm dev antes. |
| 2026-10-07 | Los seeds se aplican una sola vez; recargar la demo se evaluará en la Fase 6. |
| 2026-10-07 | Se asume Chrome 111 o superior en los celulares de los mozos; se confirmará con el dueño. |
| 2026-10-07 | Corregir ahora los 6 hallazgos adversariales medios y bajos de la 001 (enmienda 1 de la spec), sin nueva aprobación salvo que cambie lo que ve el usuario final. |
| 2026-10-07 | Integrar la 001 a main con commit de merge (--no-ff), conservando el historial. |
| 2026-10-07 | Spec 002 aprobada con las recomendaciones: escpos detiene el arranque hasta la Fase 3, corte duro en 48 columnas, caracteres sin equivalente se imprimen como ?. Pendiente para la Fase 3: marca y modelo de la impresora del dueño. |
| 2026-10-08 | Dejar como deuda, para la Fase 3, los 5 hallazgos medios y bajos de la 002 (ADV-002-01 a 05). Sus tests se marcan como falla conocida (it.fails). |
| 2026-10-08 | Integrar la 002 a main con commit de merge (--no-ff). |
| 2026-10-08 | Fase 0 aprobada en el punto de control de fin de fase; iniciar la Fase 1. |
| 2026-10-07 | El usuario confirma que existen el rol polleria y las bases polleria_dev y polleria_test en PostgreSQL 17 (puerto 5432). |

## Notas técnicas del orquestador

- 2026-10-07: las preguntas abiertas de la enmienda 1 (sección 17.11 de la spec 001) no cambian lo que ve el usuario final. Según lo acordado con el usuario, se aplican las recomendaciones: conexión a PostgreSQL sin SSL e ignorando la query del URL (S-12), la web no arranca si API_INTERNAL_URL trae usuario o clave (S-13), los errores 4xx no se registran en el log (S-14) y una migración espera sin límite a otra en curso (S-15).

- 2026-10-07: el entorno tiene Node 24.1.0 (LTS), pnpm 10.12.1, Git 2.49 y PostgreSQL 17.5 en localhost:5432. También hay un PostgreSQL 18 en el puerto 5433, que el proyecto no usa.
- 2026-10-07: HeroUI 3.2.6 (latest) exige Tailwind CSS >= 4, React >= 19 y react-aria-components.
- 2026-10-07: TypeScript 7.0.2 es latest, pero typescript-eslint 8.71.1 solo soporta TypeScript < 6.1.0. Se propone fijar TypeScript 6.0.3.

## Deuda técnica y hallazgos medios/bajos

Hallazgos adversariales de la 001 (2026-10-07, commit 7be8d15; tests en apps/api/tests/adversarial y apps/web/tests/adversarial):

| ID | Severidad | Hallazgo | Estado |
| --- | --- | --- | --- |
| ADV-001-01 | Medio | Content-Encoding desconocido: body-parser lanza 415 y la API responde 500 INTERNAL_ERROR con traza en el log. | Cerrado (enmienda 1) |
| ADV-001-02 | Medio | Cuerpo que dice ser gzip y no lo es: 500 INTERNAL_ERROR con traza. | Cerrado (enmienda 1) |
| ADV-001-04 | Medio | La guardia acepta ?host=otro-servidor en una URL polleria_test y Sequelize conecta a ese host. | Cerrado (enmienda 1) |
| ADV-001-05 | Bajo | La guardia acepta ?options=-c search_path=... y Sequelize lo aplica. | Cerrado (enmienda 1) |
| ADV-001-06 | Bajo | Dos migrateUp simultáneos: uno falla con un error crudo del driver (el estado final queda bien). | Cerrado (enmienda 1) |
| ADV-001-09 | Bajo | API_INTERNAL_URL con ruta, query o fragmento rompe el destino del rewrite sin aviso. | Cerrado (enmienda 1) |

Hallazgos adversariales de la 002 (2026-10-08, commit 0c62834; tests en apps/api/tests/adversarial y packages/shared/tests/adversarial):

| ID | Severidad | Hallazgo | Estado |
| --- | --- | --- | --- |
| ADV-002-01 | Medio | Una línea válida con miles de acentos combinantes desordenados hace que normalizar tarde más de 2 s y bloquee Node (AC-17). | Deuda (Fase 3), test con it.fails |
| ADV-002-02 | Medio | createPrinterDriver se exporta desde index.ts y su print escribe tal cual ESC, GS y NUL si alguien lo usa sin el servicio. | Deuda (Fase 3), test con it.fails |
| ADV-002-03 | Bajo | El límite de 500 líneas se aplica después de recorrer todo el arreglo (100 000 líneas se leen enteras). | Deuda (Fase 3), test con it.fails |
| ADV-002-04 | Bajo | En Windows, PRINTER_FILE_DIR como Q:comandas o C: depende de la carpeta actual o cae en la raíz del monorepo. | Deuda (Fase 3), test con it.fails |
| ADV-002-05 | Bajo | toLimaDateTimeParts confunde años antes y después de Cristo (año 0 y año 1 dan 0001). | Deuda (Fase 3), test con it.fails |

Condiciones de la deuda de la 002: ADV-002-02 debe corregirse antes de crear el driver escpos en la Fase 3 (si no, sería inyección de comandos en la impresora: Crítico). ADV-002-01 sube a Alto si las observaciones de los ítems aceptan más de unos 200 caracteres sin limitar acentos combinantes seguidos. ADV-002-01 depende de la velocidad de la máquina (en una PC unas 3 veces más rápida podría dejar de fallar y it.fails avisaría). Nota: it.fails da por buena cualquier falla, no solo la del hallazgo.

Ataques de la 002 sin fallas (regresión en verde): ningún punto de código Unicode sale fuera de los 114 imprimibles; comandos ESC/POS reales y trucos bidi, ZWJ y BOM no llegan al archivo por el servicio; jobId con trucos de rutas y nombres reservados de Windows se rechazan; 1000 impresiones simultáneas sin colisiones; fallas de escritura no dejan .txt ni .tmp; printer:test sin fugas de clave; Lima siempre UTC-5.

Ataques de la 001 sin fallas (quedan como regresión en verde): prototype pollution en JSON, 120 consultas de salud simultáneas con base disponible y caída, sin fugas de clave en errores, CLI ni salud.

Otras notas:

- Bajo (reviewer 002): print-document.ts:109 compara con un TAB literal; cambiar a 	 o String.fromCharCode(0x09) en un refactor.
- Bajo (reviewer 002): printer.service.ts:85 lanza RangeError (no PrinterError) si se inyecta un reloj que da fecha inválida; tenerlo en cuenta en la Fase 3.
- Bajo (reviewer 002): file-driver.ts usa node:timers/promises, que la lista de D-002-08 no menciona; actualizar la spec en la Fase 3.
- Atención (reviewer 002): packages/shared tiene solo 16 líneas medidas (93,75 %); poco margen sobre el umbral de 90 % para la Fase 1.

- Bajo (backend-dev, 2026-10-08): un grafema como ñ seguido de ZWJ pierde la tilde y sale n (D-002-04 paso 4d quita marcas combinantes tras NFKD). Sigue la spec; muy raro.

- 2026-10-07 (test-writer): db-cli AC-24 de la 001 superó una vez su límite de 12 s con la máquina cargada (pasa solo en 9 s). Vigilar si se vuelve intermitente.

- Bajo (reviewer, 2026-10-07): la fila "error del lector con estado 5xx → 500 y se registra" de la tabla 9.2 no tiene test de regresión (error-handler.ts:56). Pendiente para test-writer en una spec posterior.
- Pendiente manual (reviewer): probar R-11 (pnpm dev) y la sección 16 de la spec 001 desde un celular en el wifi del local y sin internet. Se incluye en el punto de control de fin de la Fase 0.
- 2026-10-07: versiones exactas registradas en CLAUDE.md (sección Stack), según la Fase 0 y el ADR 0001.
- 2026-10-08: pnpm printer:test agregado a los comandos de CLAUDE.md.

- Bajo (2026-10-07, reportado por backend-dev): si la clave de DATABASE_URL trae un escape % mal formado, loadConfig la acepta y createSequelize la rechaza con un mensaje seguro, pero server.ts y cli.ts terminan con un rechazo no controlado y traza. Se puede cerrar haciendo que loadConfig use getPostgresConnectionParts.

- Next 16.4.0 genera apps/web/AGENTS.md cuando un agente corre next dev. Resuelto con agentRules: false en next.config.ts (T-23).
- Aviso de peer opcional: @vitest/mocker 5.0.3 declara msw ^2.4.9 y el proyecto usa msw 3.0.2. Funciona (verificado por backend-dev).
- apps/web necesita zod (librería ya aprobada en el stack) para loadWebServerConfig (T-23); se agrega zod 4.6.5, la misma versión que en api y shared.
- Arbitraje 2026-10-07: backend-dev reportó un glob sin barra en apps/api/tests/migrator.test.ts; el orquestador lo verificó y test-writer lo corrigió (commit 7c19265) sin cambiar aserciones.
- Si la base no responde, el E2E falla por timeout de 120 s del webServer sin una pista clara; se sugiere que la API registre una línea en su log al no poder conectar (bajo).
- Web: un 503 con status ok, o un 200 con status error, se interpreta como unreachable (frontend-dev exige que coincidan el código HTTP y el status).
- Producción: los rewrites de Next se calculan en next build, así que API_INTERNAL_URL debe estar definida al compilar (para la guía de instalación).
- R-09: en Vitest 5 el umbral global de 80 % incluye también shared y services; es más estricto que el texto de la spec, sin efecto práctico.

## Bloqueos

Ninguno. (Resuelto 2026-10-07: el usuario creó apps/api/.env. Su clave real había quedado también en apps/api/.env.example, que se versiona; el orquestador restauró ese archivo antes de cualquier commit y verificó que el historial de git nunca tuvo la clave.)
