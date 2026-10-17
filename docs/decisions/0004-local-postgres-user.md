# PostgreSQL local de usuario para desarrollo en WSL

Fecha: 2026-10-16. Estado: autorizado por el usuario al pedir resolver todo
lo necesario para trabajar con el proyecto.

## Contexto

La copia WSL no tenía PostgreSQL ni conexión configurada. Docker Desktop no
estaba integrado con esta distribución y sudo requería contraseña. El usuario
autorizó preparar una base local y hacer funcional el arranque conjunto.

## Decisión

Usar binarios oficiales de Debian para PostgreSQL 17.11, extraídos bajo
`/home/jeremy/.local/share/polleria/postgresql-17/`, sin modificar paquetes del
sistema. Las bibliotecas libpq5 e ICU76 necesarias se extraen en el mismo
prefijo. Los datos del proyecto viven en
`/home/jeremy/.local/share/polleria/polleria-1/postgres/` con permisos privados.

La instancia escucha solo en `127.0.0.1:5432` y usa un socket local privado.
El acceso TCP exige SCRAM. La aplicación utiliza un rol dedicado sin permisos
de superusuario, propietario de `polleria_dev` y `polleria_test`. Las claves
se generan localmente y permanecen en `backend/.env`, ignorado por Git.

Un archivo ignorado `infra/.local/postgres.json` indica rutas al runner de
desarrollo. `npm run dev` asegura que ese cluster ya inicializado esté activo
y luego inicia ambos paquetes. Detener las apps conserva la instancia y sus
datos. No ejecuta migraciones ni seeds automáticamente al arrancar.

Esta preparación es local de desarrollo. No implementa despliegue de
producción ni cambia contratos, modelos o versiones de dependencias JS.
El permiso de creación se limita a este cluster nuevo; las bases existentes
de otras instalaciones deben conservarse.

## Consecuencias

No se necesita sudo, Docker o acceso externo al operar la demo ya preparada.
Las rutas locales no se versionan. Otra máquina debe preparar su propio
PostgreSQL o proporcionar una conexión existente. Se deben conservar los datos
de PostgreSQL al limpiar builds o dependencias del proyecto.
