# Progreso del proyecto — Sistema Pollería

Lo mantiene el orquestador. Se actualiza al final de cada paso del ciclo.

## Estado actual

- Fase: 0 de 6, base del proyecto.
- Funcionalidad: 001-base-monorepo.
- Paso: 9 de 9. Reviewer: APROBADO. Definición de terminado verificada por el orquestador. Esperando permiso del usuario para integrar feat/001-base-monorepo a main.
- Rama: feat/001-base-monorepo.

## Tabla de funcionalidades

| ID | Nombre | Fase | Estado | Rama | Fecha de cierre |
| --- | --- | --- | --- | --- | --- |
| 001 | base-monorepo (monorepo, herramientas, conexión a BD, GET /api/health, web mínima) | 0 | Lista para integrar (APROBADO) | feat/001-base-monorepo | — |
| 002 | printer-service (PrinterService con driver file) | 0 | Pendiente | feat/002-printer-service | — |

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

Ataques sin fallas (quedan como regresión en verde): prototype pollution en JSON, 120 consultas de salud simultáneas con base disponible y caída, sin fugas de clave en errores, CLI ni salud.

Otras notas:

- Bajo (reviewer, 2026-10-07): la fila "error del lector con estado 5xx → 500 y se registra" de la tabla 9.2 no tiene test de regresión (error-handler.ts:56). Pendiente para test-writer en una spec posterior.
- Pendiente manual (reviewer): probar R-11 (pnpm dev) y la sección 16 de la spec 001 desde un celular en el wifi del local y sin internet. Se incluye en el punto de control de fin de la Fase 0.
- 2026-10-07: versiones exactas registradas en CLAUDE.md (sección Stack), según la Fase 0 y el ADR 0001.

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
