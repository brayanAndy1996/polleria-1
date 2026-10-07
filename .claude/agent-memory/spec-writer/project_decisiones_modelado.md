---
name: decisiones-modelado
description: Decisiones de arquitectura y modelado fijadas en la spec 001 (prefijo /api, mismo origen, errores, convenciones de BD y JSON, migraciones umzug) que todas las specs siguientes deben respetar
metadata:
  type: project
---

Decisiones fijadas en docs/specs/001-base-monorepo/spec.md (escrita 2026-10-07, estado Borrador hasta que el usuario apruebe; revisar si cambió antes de apoyarse en ellas):

- API bajo prefijo /api; web Next (3000, 0.0.0.0) reenvía /api/:path* a API_INTERNAL_URL (default http://127.0.0.1:4000) con rewrites. Mismo origen, sin CORS. API escucha 127.0.0.1 por defecto. OpenAPI: servers .../api y paths sin prefijo (/health).
- Socket.IO futuro: rewrite /socket.io/:path* (Next 16.4 reenvía WebSocket en rewrites externos). Sesión futura: JWT en cookie httpOnly mismo origen.
- Errores: AppError({ code, message, httpStatus, details? }), errorHandler único, { error: { code, message, details|null } }. Códigos en inglés UPPER_SNAKE (SUPUESTO S-09: backend-dev.md dice STOCK_INSUFICIENTE; se propuso INSUFFICIENT_STOCK, pregunta abierta). VALIDATION_ERROR -> details.issues [{ path con puntos, message }]. Zod en español con z.config(z.locales.es()).
- Excepción: /api/health 503 usa HealthResponse { status, database, timestamp }, no ErrorResponse.
- BD: tablas inglés snake_case plural, columnas snake_case, Sequelize define.underscored, timestamptz UTC. JSON camelCase; dinero sufijo Cents, pollo sufijo Eighths, enteros.
- Migraciones/seeds con umzug (SequelizeMeta / SequelizeData), archivos .ts AAAAMMDDHHmmss-desc.ts con up/down({ context: QueryInterface }), en apps/api/src/db/{migrations,seeders}. Seeds se aplican una vez (SUPUESTO S-06).
- TS con type stripping de Node: erasableSyntaxOnly (sin enum/namespace/decoradores/parameter properties), imports relativos con .ts. packages/shared exporta ./src/index.ts sin build.
- Pruebas: Vitest proyectos shared/api-unit/api-integration(serie)/web(jsdom). E2E Playwright API 127.0.0.1:4100 + web 3100 contra polleria_test, reuseExistingServer false. Guardia assertTestDatabase (^[a-z0-9_]+_test$) en apps/api/src/db/assert-test-database.ts.

**Why:** el orquestador pidió guardar decisiones de modelado para coherencia entre specs; el código aún no existe, así que estas decisiones solo viven en la spec.
**How to apply:** al escribir specs nuevas, usar estas rutas, nombres y formatos; si una spec nueva necesita cambiar alguna, señalarlo explícitamente como cambio a lo aprobado. Ver también [[entorno-verificado]] y [[forma-de-las-specs]].
