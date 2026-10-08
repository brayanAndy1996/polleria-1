---
name: decisiones-users-admin
description: Decisiones aprobadas de la spec 004 (gestión de usuarios por el administrador): rutas /api/users, regla de PIN fáciles, guardia del último administrador, invalidación de sesiones y conteo, códigos USER_NOT_FOUND y LAST_ADMIN_REQUIRED, contrato 0.4.0
metadata:
  type: project
---

Spec 004 (docs/specs/004-users-admin/spec.md), **Aprobada el 2026-10-08**: el usuario respondió las 6 preguntas con las recomendaciones (S-004-01 a S-004-08 confirmados). OpenAPI 0.4.0. Sin migraciones ni variables nuevas (la tabla users de la 003 basta).

- Rutas (todas requireAuth + requireRole('admin'), Cache-Control: no-store también en errores): GET /api/users (todos, activos e inactivos, orden displayName es-PE + username), POST /api/users (201), PATCH /api/users/{userId} (200; displayName/roles/isActive, al menos uno), POST /api/users/{userId}/pin (204). Sin endpoint de detalle ni borrado (desactivar es reversible). Username inmutable (decidido, pregunta 5).
- PIN fáciles (isWeakPin + strongPinSchema en shared, pinSchema NO cambia — el login sigue aceptando débiles creados antes): repetidos, secuencias circulares mod-10 asc/desc (incluye 7890, 0987, 2109), años 1900-2099, DDMM y DDMMAA válidas (solo día 01-31 y mes 01-12, sin día real del mes), '2580' — lista aprobada tal cual (pregunta 2). isWeakPin nunca lanza y devuelve false para lo que no cumple ^[0-9]{4,6}$. WEAK_PIN_MESSAGE = 'Ese PIN es muy fácil de adivinar. Elige otro.' (issue en pin).
- Último administrador: 409 LAST_ADMIN_REQUIRED si la operación deja cero administradores activos; comprobación + UPDATE dentro de transacción con SELECT ... FOR UPDATE sobre las filas roles @> '{admin}' AND is_active (Op.contains). El propio admin puede desactivarse/quitarse el rol si queda otro activo (decidido, pregunta 3).
- Al desactivar o restablecer PIN: borrar sessions del usuario dentro de la transacción y limpiar el conteo con loginLimiter.clearAttempts(userId) nuevo. Reactivar solo limpia el conteo. createApp comparte UN solo LoginLimiter entre authService y userAdminService. No hay botón "Desbloquear" (decidido, pregunta 6).
- El admin escribe el PIN nuevo dos veces en la web (decidido, pregunta 1; no hay PIN generado). Ninguna respuesta incluye PIN ni hash. userId de ruta: ^[0-9]+$, 1..2147483647, si no 400 con issue path 'userId'.
- Web: ApiRequestOptions.method suma 'PATCH' (AC-19); páginas /admin/usuarios, /admin/usuarios/nuevo, /admin/usuarios/[id] con RoleGuard area '/admin'; la página de edición obtiene el usuario de GET /api/users (sin endpoint de detalle).
- Códigos nuevos en ERROR_CODES: USER_NOT_FOUND (404 'Ese usuario no existe.'), LAST_ADMIN_REQUIRED (409 'Debe quedar al menos un administrador activo.'); USERNAME_TAKEN ya existía y ahora lo usa POST /users.
- `pnpm users:create-admin` valida el PIN con strongPinSchema (aprobado, pregunta 4); sigue creando solo administradores.

**Why:** la lista exacta de PIN débiles (en particular la circular mod-10 y los formatos de fecha), la guardia del último admin con bloqueo, y el único LoginLimiter compartido no son obvios leyendo el código.
**How to apply:** al implementar la 004 o especificar specs siguientes, reusar strongPinSchema, isWeakPin, clearAttempts, la respuesta LastAdminRequired y el parámetro UserId. Ver [[decisiones-auth]] y [[forma-specs]].
