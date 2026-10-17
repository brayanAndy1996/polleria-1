# Cierre del entorno local — 2026-10-16

- [x] Documentar la autorización de preparar el entorno y sus bases nuevas.
- [x] Preparar PostgreSQL 17.11 de usuario en WSL y su cluster privado.
- [x] Crear rol limitado, bases de desarrollo/pruebas y conexión privada.
- [x] Aplicar ocho migraciones existentes y el seed de demostración.
- [x] Escribir regresiones del runner; rojo causal por módulo ausente.
- [x] Implementar arranque opcional y wrapper de `npm run dev` sin cambiar
  lógica del backend o contratos.
- [x] Validar tipos, lint, suite completa con cobertura y acceso real.
- [x] Actualizar guías de frontend, scripts, infraestructura y traspaso.

## Evidencia

- AC-01…04: 11 pruebas unitarias del runner con configuración temporal y
  ejecutores simulados, sin DB. El test-writer demostró rojo por módulo
  ausente y el implementer obtuvo verde antes de la verificación principal.
- AC-05: arranque real mediante `npm run dev`; recuperación del cluster local
  tras apagarlo y arranque de ambos paquetes. La parada de comprobación de
  PostgreSQL superó los 30 segundos durante un checkpoint y luego completó;
  no se forzó el cierre ni se borraron datos. Se comprobó el cierre de las apps
  propias con Ctrl+C. La instancia final está ejecutándose en la terminal del
  usuario; no se detuvo al detectar los puertos ocupados.
- AC-06: `/api/health` a través de `localhost:3000` devuelve HTTP 200 con base
  `ok`. Chromium real inició sesión como Demo Administrador y llegó a `/admin`;
  como Demo Mozo llegó a `/mozo` y vio Demo 1. Cero errores de página en ambos
  recorridos, sin MSW. Se cerraron únicamente esas sesiones de comprobación.
- Capturas locales de evidencia: `/tmp/polleria-ready-admin-20261016.png` y
  `/tmp/polleria-ready-mozo-20261016.png`; no se versionan.
- `pnpm typecheck` y `pnpm lint`: código 0. Se corrigieron dos callbacks con
  parámetros sin uso en las pruebas sin modificar aserciones.
- `pnpm test:coverage --maxWorkers=2`: código 0, 137 archivos aprobados,
  2659 pruebas aprobadas, cuatro fallos esperados previos y dos omitidas.
  Cobertura de líneas 97,23 %, umbrales cumplidos. Las pruebas de integración
  utilizaron exclusivamente la base aislada `polleria_test` con sus guardias.
- No se reejecutó la suite Playwright completa ni un nuevo build frontend:
  no cambió código de interfaz; se hicieron los dos recorridos reales de
  acceso descritos y se conservaron las verificaciones anteriores.
- Credenciales aleatorias solo en `backend/.env`, permisos 0600 e ignorado
  por Git; metadata de rutas en `infra/.local/postgres.json`, también ignorada.
- Revisión del principal, sin reviewer ni auditoría adversarial independientes.
  Sin cambios de dinero, permisos, idempotencia, migraciones o modelos.
