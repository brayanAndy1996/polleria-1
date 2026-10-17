# Separación de frontend y backend en la raíz

Estado: autorizado por el usuario el 2026-10-16.

## Objetivo

Permitir que el usuario trabaje directamente en `frontend/` sin intervenir en
la lógica del backend. Se conserva el monorepo pnpm y el funcionamiento actual.

## Alcance

- Mover `apps/web/` a `frontend/` y `apps/api/` a `backend/`, conservando todos
  sus archivos, pruebas y archivos locales si existen.
- Mantener `packages/shared/`, `docs/` y `e2e/` y añadir guías en `scripts/`
  e `infra/`. No incorporar infraestructura ni dependencias nuevas.
- Actualizar workspaces, lockfile, TypeScript, ESLint, Vitest, Playwright y
  referencias de rutas necesarias para conservar comandos y pruebas.
- Mantener los nombres de paquetes `@polleria/web`, `@polleria/api` y
  `@polleria/shared`, los puertos, los contratos HTTP y las reglas de negocio.
- Ajustar únicamente las rutas del backend que dependan de su profundidad en
  el árbol y los mensajes que indiquen la ubicación de su archivo `.env`.
- Añadir comandos claros para desarrollar, construir y probar solo frontend,
  y una guía de sus carpetas y de su conexión con la API existente.
- Registrar que trabajar solo frontend no sustituye la API cuando se necesita
  iniciar sesión o ejecutar operaciones reales. No crear mocks de producción.

## Criterios de aceptación

- AC-01: las aplicaciones residen en `frontend/` y `backend/`; no se mantienen
  copias de código en `apps/`.
- AC-02: la raíz coordina ambos paquetes con pnpm y sus enlaces a shared siguen
  apuntando al mismo paquete. Las versiones de dependencias no cambian.
- AC-03: la ruta por defecto de comandas sigue siendo `tmp/comandas` en la raíz.
  Se mantienen guardias de bases de pruebas y entradas de subprocesos/E2E.
- AC-04: rutas HTTP, lógica de dinero, permisos, sesiones, idempotencia,
  transacciones y migraciones mantienen su comportamiento.
- AC-05: el usuario puede localizar pantallas, componentes, estilos y cliente
  HTTP y ejecutar los comandos de frontend desde la raíz.
- AC-06: se ejecutan verificaciones disponibles de instalación congelada,
  tipos, lint, build y pruebas pertinentes; cualquier dependencia de DB o
  navegador ausente se informa sin crear bases, roles ni datos de desarrollo.

## Verificación y metodología

Este cambio reubica código y adapta regresiones existentes; no añade funciones
de negocio. El test-writer adapta únicamente rutas y expectativas afectadas,
sin debilitar aserciones. El implementer mueve archivos y adapta configuración
y rutas, sin cambiar el contenido de pruebas. El principal redacta, revisa y
verifica. No hay reviewer ni auditoría adversarial independientes.

El usuario autorizó la reorganización, no un merge, commit o push. Se trabaja
en el checkout existente y en una rama propia.
