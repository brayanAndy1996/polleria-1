# Progreso del proyecto — Sistema Pollería

Lo mantiene el orquestador. Se actualiza al final de cada paso del ciclo.

## Estado actual

- Fase: 0 de 6, base del proyecto.
- Funcionalidad: 001-base-monorepo.
- Paso: 4 de 9, tests en rojo (test-writer, T-07 a T-16). Andamiaje T-01 a T-06 terminado y verificado por el orquestador.
- Rama: feat/001-base-monorepo.

## Tabla de funcionalidades

| ID | Nombre | Fase | Estado | Rama | Fecha de cierre |
| --- | --- | --- | --- | --- | --- |
| 001 | base-monorepo (monorepo, herramientas, conexión a BD, GET /api/health, web mínima) | 0 | Tests en rojo | feat/001-base-monorepo | — |
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
| 2026-10-07 | El usuario confirma que existen el rol polleria y las bases polleria_dev y polleria_test en PostgreSQL 17 (puerto 5432). |

## Notas técnicas del orquestador

- 2026-10-07: el entorno tiene Node 24.1.0 (LTS), pnpm 10.12.1, Git 2.49 y PostgreSQL 17.5 en localhost:5432. También hay un PostgreSQL 18 en el puerto 5433, que el proyecto no usa.
- 2026-10-07: HeroUI 3.2.6 (latest) exige Tailwind CSS >= 4, React >= 19 y react-aria-components.
- 2026-10-07: TypeScript 7.0.2 es latest, pero typescript-eslint 8.71.1 solo soporta TypeScript < 6.1.0. Se propone fijar TypeScript 6.0.3.

## Deuda técnica y hallazgos medios/bajos

- apps/api/src/placeholder.ts es temporal (lo exige tsc mientras no haya módulos). Se borra en T-18.
- Next 16.4.0 genera apps/web/AGENTS.md cuando un agente corre next dev. Se desactivará con agentRules: false en T-23.
- Aviso de peer opcional: @vitest/mocker 5.0.3 declara msw ^2.4.9 y el proyecto usa msw 3.0.2. Funciona (verificado por backend-dev).
- R-09: en Vitest 5 el umbral global de 80 % incluye también shared y services; es más estricto que el texto de la spec, sin efecto práctico.

## Bloqueos

Ninguno.
