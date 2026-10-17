# Arquitectura y separación de responsabilidades

La raíz coordina un monorepo pnpm con dos aplicaciones independientes en
ejecución y un paquete compartido. La reorganización del 2026-10-16 cambia
ubicaciones, no funcionalidad ni contratos.

```text
polleria-1/
├── frontend/           Next.js: pantallas y cliente HTTP
├── backend/            Express: permisos, reglas, persistencia e impresión
├── packages/shared/    Esquemas Zod, tipos y funciones puras
├── docs/               Contratos, decisiones y estado del proyecto
├── e2e/                Recorridos integrados con Playwright
├── scripts/            Espacio para utilidades; comandos actuales en package.json
└── infra/              Guía de operación; despliegue aún no automatizado
```

## Flujo de ejecución

El navegador accede a Next.js en el puerto 3000. Las solicitudes `/api/*`
se reenvían desde Next a Express, por defecto en `127.0.0.1:4000`. Express
valida la sesión y los permisos, ejecuta servicios de dominio y persiste en
PostgreSQL. El despachador de comandas se inicia dentro del proceso de la API
y usa actualmente el driver de archivos.

Los nombres internos de los paquetes no cambian: `@polleria/web`,
`@polleria/api` y `@polleria/shared`. La aplicación web consume shared mediante
el workspace y valida las respuestas de la API con sus esquemas.

## Fronteras de trabajo

- Frontend: pantallas, componentes, estilos, imágenes, mensajes, formularios y
  adaptación de solicitudes/respuestas al contrato existente.
- Backend: sesiones, autorización, precios definitivos, transacciones,
  idempotencia, migraciones, PostgreSQL y trabajos de impresión.
- Shared: contratos y funciones puras usadas por ambas aplicaciones. Sus
  cambios requieren revisar el impacto en ambos lados.
- Raíz: versiones, workspaces, lint, tipos y configuración de pruebas.

La persona que trabaje la interfaz debe comenzar por [FRONTEND.md](FRONTEND.md).
Una necesidad de API se coordina contra [OpenAPI](api/openapi.yaml), sin
introducir reglas de negocio o credenciales de base de datos en el navegador.

## Alcance funcional y operación

Se conserva el estado de las entregas 001 a 013 y la spec 014 de cobros sigue
pendiente de implementación. La mudanza no habilita inventario, reportes,
impresión física, sincronización desconectada ni múltiples negocios.

El funcionamiento sin internet presupone un servidor y una red local
disponibles. Las pantallas operativas consultan periódicamente la API. Las
pruebas de interfaz pueden usar MSW sin PostgreSQL; integración y E2E necesitan
una base aislada con nombre terminado en `_test` y sus guardias activas.

## Ubicaciones actualizadas

| Ubicación anterior | Ubicación actual |
| --- | --- |
| `apps/web/` | `frontend/` |
| `apps/api/` | `backend/` |
| `apps/api/.env` | `backend/.env` |
| `apps/web/.env.local` | `frontend/.env.local` |

Los comandos anteriores que filtran por nombre de paquete siguen siendo
válidos. La raíz por defecto de archivos de comandas continúa en
`tmp/comandas/`, fuera del código fuente.
