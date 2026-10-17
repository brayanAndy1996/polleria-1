---
name: project-adversarial-findings-001
description: Hallazgos adversariales abiertos de la spec 001 (base del monorepo) al 2026-10-07; ninguno crítico/alto
metadata:
  type: project
---

Ataque a la funcionalidad 001 (base del monorepo) el 2026-10-07. Tests en backend/tests/adversarial/ y frontend/tests/adversarial/ (*.adversarial.test.ts). Hallazgos abiertos (ninguno Crítico ni Alto, así que no bloquean la DoD):

- ADV-001-01/02 (Medio): el errorHandler solo mapea `entity.parse.failed` y `entity.too.large`; cualquier otro error del lector del cuerpo (Content-Encoding desconocido, gzip corrupto) cae a 500 INTERNAL_ERROR con traza en stderr, siendo una falla de cliente (4xx).
- ADV-001-04 (Medio) y ADV-001-05 (Bajo): gap de la guardia de base, ver [[project-test-db-guard-gap]].
- ADV-001-06 (Bajo): dos `migrateUp` concurrentes sobre polleria_test fallan con error crudo del driver ("llave duplicada ..."); AC-21 solo cubre idempotencia secuencial.
- ADV-001-09 (Bajo): loadWebServerConfig solo quita barras finales de API_INTERNAL_URL; una ruta/query/fragmento se conserva y rompe el destino del rewrite de next.config.

Lo que NO rompió (regresión en verde): prototype pollution via cuerpo JSON (ADV-001-03), 120 /api/health concurrentes con base disponible e inalcanzable (ADV-001-07/08). También verificado sin fallas: no hay unhandledRejection en la promesa perdedora de health.service (Promise.race la deja "manejada").

**Why:** registro del estado de seguridad de la fase 0 para el orquestador y el reviewer.
**How to apply:** este es un estado puntual; verifica contra git/código antes de asumir que siguen abiertos (los implementadores pueden haberlos corregido). Útil como lista de reataque en specs futuras.
