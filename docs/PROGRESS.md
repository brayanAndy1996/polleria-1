# Progreso del proyecto — Sistema Pollería

Lo mantiene el orquestador. Se actualiza al final de cada paso del ciclo.

## Estado actual

- Fase: 0 de 6, base del proyecto.
- Funcionalidad: 001-base-monorepo.
- Paso: 3 de 9, esperando aprobación de la spec por el usuario.
- Rama: feat/001-base-monorepo.

## Tabla de funcionalidades

| ID | Nombre | Fase | Estado | Rama | Fecha de cierre |
| --- | --- | --- | --- | --- | --- |
| 001 | base-monorepo (monorepo, herramientas, conexión a BD, GET /api/health, web mínima) | 0 | Spec en aprobación | feat/001-base-monorepo | — |
| 002 | printer-service (PrinterService con driver file) | 0 | Pendiente | feat/002-printer-service | — |

## Decisiones del usuario

| Fecha | Decisión |
| --- | --- |
| 2026-10-07 | Iniciar la Fase 0. |

## Notas técnicas del orquestador

- 2026-10-07: el entorno tiene Node 24.1.0 (LTS), pnpm 10.12.1, Git 2.49 y PostgreSQL 17.5 en localhost:5432. También hay un PostgreSQL 18 en el puerto 5433, que el proyecto no usa.
- 2026-10-07: HeroUI 3.2.6 (latest) exige Tailwind CSS >= 4, React >= 19 y react-aria-components.
- 2026-10-07: TypeScript 7.0.2 es latest, pero typescript-eslint 8.71.1 solo soporta TypeScript < 6.1.0. Se propone fijar TypeScript 6.0.3.

## Deuda técnica y hallazgos medios/bajos

Ninguna por ahora.

## Bloqueos

Ninguno.
