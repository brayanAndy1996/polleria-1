---
name: decisiones-modelado
description: Decisiones de arquitectura y modelado fijadas en la spec 001 y su enmienda 1 (prefijo /api, mismo origen, errores y códigos, conexión solo con partes del URL, bloqueo de migraciones, convenciones BD/JSON, umzug) que todas las specs siguientes deben respetar
metadata:
  type: project
---

Decisiones fijadas en docs/specs/001-base-monorepo/spec.md (Aprobada 2026-10-07; enmienda 1 aprobada el mismo día, sección 17). Revisar la spec si algo parece haber cambiado.

- API bajo prefijo /api; web Next (3000, 0.0.0.0) reenvía /api/:path* a API_INTERNAL_URL (default http://127.0.0.1:4000) con rewrites. Mismo origen, sin CORS. API escucha 127.0.0.1 por defecto. OpenAPI: servers .../api y paths sin prefijo (/health).
- Enmienda 1 (D-14): loadWebServerConfig reduce API_INTERNAL_URL a su origen (sin ruta/query/fragmento) y rechaza usuario:clave@ (SUPUESTO S-13).
- Socket.IO futuro: rewrite /socket.io/:path* (Next 16.4 reenvía WebSocket en rewrites externos). Sesión futura: JWT en cookie httpOnly mismo origen.
- Errores: AppError({ code, message, httpStatus, details? }), errorHandler único, { error: { code, message, details|null } }. Códigos en inglés UPPER_SNAKE (usuario confirmó: INSUFFICIENT_STOCK). VALIDATION_ERROR -> details.issues [{ path con puntos, message }]. Zod en español con z.config(z.locales.es()).
- Códigos vigentes tras la enmienda 1: NOT_FOUND 404, INVALID_JSON 400, INVALID_BODY 400 ('No se pudo leer el cuerpo de la solicitud.'), VALIDATION_ERROR 400, PAYLOAD_TOO_LARGE 413, UNSUPPORTED_MEDIA_TYPE 415 ('La codificación del cuerpo de la solicitud no es compatible.'), INTERNAL_ERROR 500. Los 4xx no se registran en el log; solo los 500 con traza (RN-001-07). Contrato OpenAPI en versión 0.2.0.
- Excepción: /api/health 503 usa HealthResponse { status, database, timestamp }, no ErrorResponse.
- Conexión (D-12): createSequelize usa solo protocolo, usuario, clave, host, puerto y base del URL; ignora toda la query (sin lista blanca, ni sslmode); dialectOptions exactamente { connectionTimeoutMillis: 5000, ssl: false } (SUPUESTO S-12: sin SSL). La guardia assertTestDatabase no cambió.
- Bloqueos consultivos de PostgreSQL: registro de claves en D-13 de la spec 001. 2026100701 = migraciones y seeds (MIGRATION_LOCK_KEY en migrator.ts). Una spec nueva que use bloqueos consultivos agrega su clave a ese registro y no reutiliza esta.
- BD: tablas inglés snake_case plural, columnas snake_case, Sequelize define.underscored, timestamptz UTC. JSON camelCase; dinero sufijo Cents, pollo sufijo Eighths, enteros.
- Migraciones/seeds con umzug (SequelizeMeta / SequelizeData), archivos .ts AAAAMMDDHHmmss-desc.ts con up/down({ context: QueryInterface }), en apps/api/src/db/{migrations,seeders}. Seeds se aplican una vez (S-06, confirmado).
- TS con type stripping de Node: erasableSyntaxOnly (sin enum/namespace/decoradores/parameter properties), imports relativos con .ts. packages/shared exporta ./src/index.ts sin build.
- Pruebas: Vitest proyectos shared/api-unit/api-integration(serie)/web(jsdom). E2E Playwright API 127.0.0.1:4100 + web 3100 contra polleria_test, reuseExistingServer false. Guardia assertTestDatabase (^[a-z0-9_]+_test$) en apps/api/src/db/assert-test-database.ts.

**Why:** el orquestador pidió guardar decisiones de modelado para coherencia entre specs; varias (claves de bloqueo, códigos de error, reglas de conexión) no son obvias leyendo solo el código.
**How to apply:** al escribir specs nuevas, usar estas rutas, nombres, códigos y formatos; si una spec nueva necesita cambiar alguna, señalarlo explícitamente como cambio a lo aprobado. Ver también [[entorno-verificado]] y [[forma-de-las-specs]].
