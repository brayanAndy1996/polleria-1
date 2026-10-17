# Entorno local listo para frontend

Autorizado por el usuario: «si soluciona todo para poder trabajarlo».

## Objetivo y autorización

Disponer de PostgreSQL 17 local, API, frontend y usuarios demo funcionales.
Esta autorización permite preparar una instalación de usuario, un cluster
nuevo y las bases `polleria_dev`/`polleria_test` con un rol local dedicado,
configurar el `.env` ignorado y aplicar las migraciones/seed existentes de
demo. Es una excepción explícita para este entorno a la preparación manual
descrita en CLAUDE.md; no autoriza borrar datos ni alterar bases existentes.

No se cambia la lógica de negocio ni se añaden dependencias de aplicación.

## Arranque

`npm run dev` debe iniciar los servicios frontend/backend existentes mediante
pnpm. Cuando exista `infra/.local/postgres.json`, antes debe asegurar que el
PostgreSQL de usuario indicado está iniciado. Sin ese archivo, mantiene el
comportamiento para instalaciones de PostgreSQL gestionadas externamente.

El archivo local contiene `binDir`, `dataDir`, `libDir` y `logFile` absolutos.
No contiene claves. El runner usa `pg_ctl status -D <dataDir>`; si ya está
iniciado lo conserva; si no lo está, ejecuta `pg_ctl start -D <dataDir> -l
<logFile> -w -t 30`. Propaga LD_LIBRARY_PATH con libDir al subproceso. No usa
shell ni concatena comandos; errores de configuración/arranque impiden
arrancar las apps con un mensaje claro, sin mostrar URLs ni contraseñas.

La base persiste tras detener frontend/backend. No inicializar, migrar,
sembrar ni recrear bases en cada arranque. El runner solo arranca el cluster
local ya preparado. Las apps mantienen sus scripts y puertos actuales.

## Criterios de aceptación

- AC-01: con configuración local ausente, no se ejecuta pg_ctl.
- AC-02: configuración incompleta o inválida falla con mensaje útil.
- AC-03: status exitoso conserva la instancia sin ejecutar start.
- AC-04: status de proceso apagado ejecuta start con argumentos separados y
  espera limitada; errores de pg_ctl no se ocultan.
- AC-05: `npm run dev` prepara la base local opcional y arranca ambos paquetes;
  propaga señales y códigos de salida de pnpm, sin matar procesos ajenos.
- AC-06: /api/health responde 200 a través de Next y el login demo funciona.

Pruebas del runner con configuración temporal y ejecutores simulados, sin
conectar a DB. Verificación real con bases creadas para este proyecto; los
tests y E2E solo usan `polleria_test` con guardias. Sin nuevos permisos de
negocio ni cambios de contratos.
