# Infraestructura

Configuración de operación local; el despliegue de producción sigue pendiente.

En esta copia WSL se preparó PostgreSQL 17.11 de usuario. Sus binarios viven en
`/home/jeremy/.local/share/polleria/postgresql-17/` y los datos del proyecto en
`/home/jeremy/.local/share/polleria/polleria-1/postgres/`. No están dentro del
repositorio y no deben borrarse al limpiar builds o dependencias.

`infra/.local/postgres.json` es privado e ignorado por Git. Indica las rutas
absolutas `binDir`, `dataDir`, `libDir` y `logFile` que usa `npm run dev` para
iniciar PostgreSQL si está apagado. No contiene credenciales. La conexión de
la aplicación está en `backend/.env`, también ignorado por Git.

Detener frontend/backend con Ctrl+C conserva PostgreSQL y sus datos. El
arranque no repite migraciones ni seeds. Sin el JSON local, el runner asume
que PostgreSQL se gestiona externamente; el archivo no se distribuye al clonar.

Ver [la decisión de instalación](../docs/decisions/0004-local-postgres-user.md).
