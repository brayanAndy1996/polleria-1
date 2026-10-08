---
name: decisiones-auth
description: Decisiones de la spec 003 (usuarios, PIN, sesión opaca en la base, cookie polleria_session, límite de intentos, roles y áreas, códigos 401/403/429/409, ids enteros) que las specs 004 y siguientes deben respetar o enmendar explícitamente
metadata:
  type: project
---

Spec 003 (docs/specs/003-users-pin-login/spec.md), Borrador del 2026-10-08, ADR 0002 Propuesto. Revisar si cambió de estado o si el usuario eligió JWT (pregunta 1).

- Sesión: token aleatorio 32 bytes base64url (43 chars) en cookie `polleria_session`; la tabla sessions guarda solo sha256 hex (token_hash). NO JWT, NO SESSION_SECRET, sin variables de entorno nuevas (CONFIG_VARIABLES sigue con 7). Cookie HttpOnly, SameSite=Strict, Path=/, Max-Age=57600, sin Secure (LAN por HTTP), sin Domain. 16 h fijas, sin renovación. Login exitoso borra sesiones vencidas de todos.
- requireAuth = createRequireAuth({ sessionService }) → res.locals.auth { sessionId, user, expiresAt } (getAuthContext). Lee rol e is_active de la base en cada solicitud. requireRole(...roles) después; sin contexto → 401; lista vacía lanza. Rutas públicas: /health, /auth/users, /auth/login, /auth/logout.
- Códigos nuevos: INVALID_CREDENTIALS 401 'Usuario o PIN incorrecto.', UNAUTHENTICATED 401 'Debes iniciar sesión para continuar.', FORBIDDEN 403 'No tienes permiso para realizar esta acción.', TOO_MANY_ATTEMPTS 429 (details.retryAfterSeconds + Retry-After), USERNAME_TAKEN 409 'Ese nombre de usuario ya existe.'. OpenAPI 0.3.0 con securityScheme sessionCookie.
- Límite: por usuario existente, en memoria, 5 fallos seguidos → 15 min; después cada fallo re-bloquea; éxito resetea; 400 y 429 no cuentan; inexistentes no se cuentan (dummy bcrypt). Se cuenta antes de comparar (sin carreras). No por IP: el rewrite de Next no reenvía la IP.
- Modelo: users(id INTEGER autoincr, username varchar32 único y en minúsculas con CHECK de patrón, display_name varchar40, pin_hash varchar60, role varchar16 CHECK, is_active, timestamps) y sessions(id, user_id FK CASCADE + sessions_user_id_idx, token_hash varchar64 único CHECK hex, expires_at, created_at). Migraciones 20261008120000-create-users.ts y 20261008120100-create-sessions.ts. PK enteras como convención para las siguientes specs. defineModels(sequelize) con sequelize.define por instancia.
- Roles waiter/kitchen/cashier/admin, uno por usuario. Áreas web: /mozo (waiter, admin), /caja (cashier, admin), /admin (admin), /cocina (kitchen, admin). Login con lista pública de activos (username + displayName) y teclado de PIN 4-6 dígitos; recuerda último usuario en localStorage 'polleria:lastUsername'.
- Esquemas shared: usernameSchema (trim+lowercase, ^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$), displayNameSchema (trim+NFC, 1-40, ^[\p{L}\p{N}][\p{L}\p{M}\p{N} .'-]*$u), pinSchema ^[0-9]{4,6}$.
- Bootstrap: `pnpm users:create-admin` (apps/api/src/create-admin.ts, interactivo, nunca PIN por argumento ni env; aviso en stderr si no es TTY). Crea admin cada vez (sirve para recuperar acceso).
- Web: cliente central apps/web/src/lib/api/client.ts (ApiError, NETWORK_ERROR/UNEXPECTED_RESPONSE solo del cliente, 401 UNAUTHENTICATED → hardNavigate('/login') de lib/navigation.ts). Guardia en el cliente (RoleGuard), sin proxy de Next.
- Test helper resetMigrationTables debe borrar también las tablas de dominio; toda spec que agregue tablas debe ampliarlo.

**Why:** son decisiones no obvias que la 004 (gestión de usuarios), la Fase 2 (autorización con PIN de admin) y Socket.IO reutilizan; la sesión opaca contradice lo que decía backend-dev.md (JWT).
**How to apply:** en 004 usar requireRole('admin'), USERNAME_TAKEN, borrar sesiones y conteo al desactivar o cambiar PIN; en Fase 2 reutilizar PinHasher con otro LoginLimiter. Ver [[decisiones-modelado]] y [[entorno-verificado]].
