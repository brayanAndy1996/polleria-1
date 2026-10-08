---
name: decisiones-users-admin
description: Propuesta de la spec 004 (gestión de usuarios por el administrador, BORRADOR pendiente de aprobación): rutas /api/users, regla de PIN fáciles, guardia del último administrador, invalidación de sesiones y conteo, códigos USER_NOT_FOUND y LAST_ADMIN_REQUIRED, contrato 0.4.0
metadata:
  type: project
---

Spec 004 (docs/specs/004-users-admin/spec.md), **Borrador**: verificar qué respondió el usuario a las 6 preguntas abiertas antes de reutilizar. OpenAPI 0.4.0. Sin migraciones ni variables nuevas (la tabla users de la 003 basta).

- Rutas propuestas (todas requireAuth + requireRole('admin'), Cache-Control: no-store también en errores): GET /api/users (todos, activos e inactivos, orden displayName es-PE + username), POST /api/users (201), PATCH /api/users/{userId} (200; displayName/roles/isActive, al menos uno), POST /api/users/{userId}/pin (204). Sin endpoint de detalle ni borrado (desactivar es reversible). Username inmutable.
- PIN fáciles (isWeakPin + strongPinSchema en shared, pinSchema NO cambia — el login sigue aceptando débiles creados antes): repetidos, secuencias circulares mod-10 asc/desc (incluye 7890, 0987, 2109), años 1900-2099, DDMM y DDMMAA válidas (solo día 01-31 y mes 01-12, sin día real del mes), '2580'. isWeakPin nunca lanza y devuelve false para lo que no cumple ^[0-9]{4,6}$. WEAK_PIN_MESSAGE = 'Ese PIN es muy fácil de adivinar. Elige otro.' (issue en pin).
- Último administrador: 409 LAST_ADMIN_REQUIRED si la operación deja cero administradores activos; comprobación + UPDATE dentro de transacción con SELECT ... FOR UPDATE sobre las filas roles @> '{admin}' AND is_active (Op.contains). El propio admin puede desactivarse/quitarse el rol si queda otro activo (SUPUESTO).
- Al desactivar o restablecer PIN: borrar sessions del usuario dentro de la transacción y limpiar el conteo con loginLimiter.clearAttempts(userId) nuevo. Reactivar solo limpia el conteo. createApp comparte UN solo LoginLimiter entre authService y userAdminService.
- El admin escribe el PIN nuevo dos veces en la web (SUPUESTO; alternativa: PIN generado y mostrado una vez — pregunta 1). Ninguna respuesta incluye PIN ni hash. userId de ruta: ^[0-9]+$, 1..2147483647, si no 400 con issue path 'userId'.
- Web: ApiRequestOptions.method suma 'PATCH' (AC-19); páginas /admin/usuarios, /admin/usuarios/nuevo, /admin/usuarios/[id] con RoleGuard area '/admin'; la página de edición obtiene el usuario de GET /api/users (sin endpoint de detalle).
- Códigos nuevos en ERROR_CODES: USER_NOT_FOUND (404 'Ese usuario no existe.'), LAST_ADMIN_REQUIRED (409 'Debe quedar al menos un administrador activo.'); USERNAME_TAKEN ya existía y ahora lo usa POST /users.
- `pnpm users:create-admin` validaría el PIN con strongPinSchema si se aprueba la pregunta 4.

**Why:** la lista exacta de PIN débiles (en particular la circular mod-10 y los formatos de fecha), la guardia del último admin con bloqueo, y el único LoginLimiter compartido no son obvios leyendo el código; si las preguntas cambian supuestos, la spec se revisa antes de las pruebas.
**How to apply:** al implementar o especificar la 005+, reusar strongPinSchema, isWeakPin, clearAttempts, la respuesta LastAdminRequired y el parámetro UserId; revisar primero si el usuario aprobó S-004-01 a S-004-08. Ver [[decisiones-auth]] y [[forma-specs]].
