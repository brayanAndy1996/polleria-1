# Progreso del proyecto — Sistema Pollería

Lo mantiene el orquestador. Se actualiza al final de cada paso del ciclo.
Para retomar el trabajo en una conversación nueva, leer primero docs/CONTINUAR.md (contexto completo y siguiente acción exacta).

## Estado actual

- Fase: 1 de 6, usuarios y carta (RF-01, RF-18, RF-19; RNF-09, RNF-10). La Fase 0 se cerró y el usuario la aprobó el 2026-10-08.
- Funcionalidad: 003-users-pin-login (cerrada). Siguiente: propuesta 004.
- Paso: 003 terminada e integrada a main el 2026-10-08 (merge 80340c3, cuatro commits por responsabilidad). Spec 003 aprobada con revisión 1 y aclaración adversarial (44 AC; OpenAPI 0.3.1; ADR 0002). Reviewer: APROBADO.
- Siguiente acción: encargar al spec-writer la propuesta 004 (gestión de usuarios por el administrador) en una rama feat/004-*; el usuario la aprueba antes de tests e implementación. Conservar los pendientes manuales documentados.
- Rama: main (integrada la 003).
- Vueltas por los pasos 5 a 7 en la 003: 1 de 3. La primera auditoría adversarial independiente dejó dos hallazgos medios; el usuario aprobó corregir ambos.

## Tabla de funcionalidades

| ID | Nombre | Fase | Estado | Rama | Fecha de cierre |
| --- | --- | --- | --- | --- | --- |
| 001 | base-monorepo (monorepo, herramientas, conexión a BD, GET /api/health, web mínima) | 0 | Cerrada (APROBADO; 2 vueltas) | feat/001-base-monorepo | 2026-10-07 |
| 002 | printer-service (PrinterService con driver file, pnpm printer:test) | 0 | Cerrada (APROBADO; 1 vuelta; 5 hallazgos como deuda) | feat/002-printer-service | 2026-10-08 |
| 003 | users-pin-login (usuarios con varios roles, login con PIN, sesión en la base, requireAuth/requireRole, áreas por rol) | 1 | Cerrada (APROBADO; 44 AC cubiertos; 44 adversariales verdes; integrada a main en el merge 80340c3; pendientes manuales registrados) | feat/003-users-pin-login | 2026-10-08 |
| 004 | (propuesta) gestión de usuarios por el administrador (alta, roles, PIN, desactivar, PIN fáciles) | 1 | Pendiente | — | — |
| 005 | (propuesta) productos y precios de la carta | 1 | Pendiente | — | — |
| 006 | (propuesta) presentaciones y partes con consumo en octavos (RF-19) | 1 | Pendiente | — | — |
| 007 | (propuesta) combos | 1 | Pendiente | — | — |
| 008 | (propuesta) pantallas de administración de la carta | 1 | Pendiente | — | — |

La división 004 a 008 es una propuesta del orquestador; cada una se confirma al escribir su spec.

## Decisiones del usuario

| Fecha | Decisión |
| --- | --- |
| 2026-10-07 | Iniciar la Fase 0. |
| 2026-10-07 | El usuario confirma que existen el rol polleria y las bases polleria_dev y polleria_test en PostgreSQL 17 (puerto 5432). |
| 2026-10-07 | Spec 001 aprobada con las recomendaciones del orquestador. |
| 2026-10-07 | API con prefijo /api, mismo origen que la web vía rewrites de Next.js, sin CORS. La API escucha solo en 127.0.0.1. |
| 2026-10-07 | Dependencias de soporte de la spec 001 aprobadas, incluidas las opcionales eslint-plugin-react-hooks y @testing-library/jest-dom (ADR 0001 aceptado). |
| 2026-10-07 | Códigos de error en inglés (por ejemplo INSUFFICIENT_STOCK); mensajes en español. Se corrigió backend-dev.md. |
| 2026-10-07 | Se mantiene Node 24.1.0 (jsdom 29.1.1). |
| 2026-10-07 | Para correr los E2E hay que detener pnpm dev antes. |
| 2026-10-07 | Los seeds se aplican una sola vez; recargar la demo se evaluará en la Fase 6. |
| 2026-10-07 | Se asume Chrome 111 o superior en los celulares de los mozos; se confirmará con el dueño. |
| 2026-10-07 | Corregir ahora los 6 hallazgos adversariales medios y bajos de la 001 (enmienda 1 de la spec), sin nueva aprobación salvo que cambie lo que ve el usuario final. |
| 2026-10-07 | Integrar la 001 a main con commit de merge (--no-ff), conservando el historial. |
| 2026-10-07 | Spec 002 aprobada con las recomendaciones: escpos detiene el arranque hasta la Fase 3, corte duro en 48 columnas, caracteres sin equivalente se imprimen como ?. Pendiente para la Fase 3: marca y modelo de la impresora del dueño. |
| 2026-10-08 | Dejar como deuda, para la Fase 3, los 5 hallazgos medios y bajos de la 002 (ADV-002-01 a 05). Sus tests se marcan como falla conocida (it.fails). |
| 2026-10-08 | Integrar la 002 a main con commit de merge (--no-ff). |
| 2026-10-08 | Fase 0 aprobada en el punto de control de fin de fase; iniciar la Fase 1. |
| 2026-10-08 | Spec 003: sesión guardada en la base (token aleatorio con SHA-256, sin JWT); ADR 0002 aceptado (bcrypt 6.0.0 y @types/bcrypt 6.0.0). Se corrigieron backend-dev.md y adversarial-tester.md. |
| 2026-10-08 | Spec 003: 5 intentos fallidos bloquean 15 min; sesión de 16 h; cocina puede iniciar sesión (pantalla vacía); PIN fáciles se tratan en la 004. |
| 2026-10-08 | PIN de 4 a 6 dígitos con botón Entrar. |
| 2026-10-08 | En /login el trabajador toca su nombre en una lista de usuarios activos. |
| 2026-10-08 | Una persona puede tener VARIOS roles (cambia el supuesto S-003-04 de la spec 003). |
| 2026-10-08 | Revisión 1 de la spec 003 aprobada: roles como arreglo en users.roles; requireRole deja pasar con al menos un rol; con varias áreas se entra a la última usada en ese equipo o a /areas ("¿Dónde vas a trabajar?"); enlace "Cambiar de área"; el administrador elige área la primera vez en cada equipo; pnpm users:create-admin solo crea administradores (otros roles en la 004). |
| 2026-10-08 | En esta copia: autoriza reconstruir node_modules y las limpiezas de las tablas de pruebas indicadas exclusivamente en polleria_test, con guardias; nunca en polleria_dev. |
| 2026-10-08 | Exige continuar con subagentes separados por rol y metodología SDD, TDD y pruebas adversariales. Se configura el equipo nativo en .devin/, usando docs/agents/ como fuente de roles. |
| 2026-10-08 | Autoriza corregir los dos medios ADV-003-06 y ADV-003-14: contador se reinicia solo tras guardar sesión; logout solo confirma HTTP 204. Spec aclarada, correcciones en rojo/verde y revalidación independientes. |
| 2026-10-08 | Autoriza preparar los commits e integrar la 003 a main: cuatro commits por responsabilidad (test, feat shared/API, feat web, docs) y merge --no-ff 80340c3. Confirma que los subagentes de implementación y revisión usaron el modelo de la ventana principal (los de exploración, el modelo del enrutador). |

## Notas técnicas del orquestador

### Continuación en Devin de esta copia (2026-10-08)

- El usuario autorizó reconstruir únicamente las carpetas node_modules de esta copia. Instalación congelada y bcrypt 6.0.0/@types/bcrypt 6.0.0 verificados.
- El usuario autorizó las limpiezas de pruebas exclusivamente en polleria_test para users, sessions, SequelizeMeta, SequelizeData, fixture_a, fixture_b, fixture_seed_rows, FixtureMeta y FixtureData. La conexión se verificó sin modificar datos antes de ejecutar las pruebas. Nunca se ejecutaron migraciones/seeds en polleria_dev.
- Desviación registrada: el agente principal escribió las primeras pruebas e implementación de la 003 directamente, sin subagentes. Hubo rojo por módulos/tablas ausentes antes del verde, pero no separación de autores. No se presenta ese trabajo como delegado ni como revisado independientemente.
- El usuario exigió continuar con subagentes, SDD, TDD y pruebas adversariales. Desde ese punto el principal solo orquesta. Se añadieron adaptadores nativos en .devin/agents/ y una regla obligatoria en .devin/rules/orquestacion-sdd-tdd.md; las definiciones de roles de referencia son docs/agents/.
- Verificación anterior a las auditorías: pnpm test:coverage dio 722 pasan y 7 fallas esperadas (729); cobertura global de líneas 97,98 %, shared 97,36 %, services/auth 98,46 % y services/users 91,66 %. pnpm lint y pnpm typecheck pasaron. Estas cifras no equivalen a aceptación de todos los AC ni a una auditoría adversarial.
- spec-writer independiente confirmó coherencia entre la spec aprobada, tasks, ADR y OpenAPI 0.3.1. Se corrigió la instrucción genérica obsoleta de docs/agents/frontend-dev.md: el tipado reutiliza Zod de shared, sin instalar openapi-typescript.
- test-writer independiente completó la auditoría y reforzó los escenarios exigidos, sin editar producción: 193 pruebas específicas de la 003 en verde. Resolvió un conflicto del cargador de Playwright/Node/Sequelize aislando la preparación E2E en un proceso Node nativo con guardias exactas de polleria_test, sin cambiar versiones. E2E: 14 pasan y 2 no aplicables; lint y tipos pasan. Son resultados del subagente, pendientes de comprobación final del orquestador.
- devin doctor validó los siete perfiles nativos polleria-* en .devin/agents/ (código 0). En esta sesión las delegaciones usan los perfiles nativos disponibles con las instrucciones explícitas de cada rol.
- Auditoría adversarial independiente: 35 casos, 32 verdes y 3 rojos; críticos 0, altos 0, medios 2. ADV-003-06: reset prematuro del contador si falla guardar la sesión. ADV-003-14: logout malformado 200/202 interpretado como éxito.
- El usuario aprobó corregir ambos medios. spec-writer aclaró spec/tasks sin ampliar los 44 AC ni el contrato externo. Backend-dev y frontend-dev corrigieron producción en archivos disjuntos, comprobaron rojo antes y verde después y no editaron tests. El contador solo se reinicia tras crear la sesión; logout exige 204 real mediante expectedStatus y skipAuthRedirect.
- Revalidación adversarial independiente posterior: los 35 casos originales quedaron verdes sin debilitar aserciones, incluidos los tres rojos históricos. Se añadieron nueve casos posaclaración de logout malformado/401: 44/44 propios en verde. ADV-003-06 y ADV-003-14 RESUELTOS, abiertos críticos/altos/medios/bajos: 0 en esa auditoría.
- Reviewer independiente: APROBADO, sin bloqueantes. Comprobó personalmente los cuatro comandos de la definición de terminado, E2E, 44 AC y las regresiones; no editó archivos. La desviación inicial de autoría queda reconocida, no se presenta como delegación retrospectiva.
- Verificación final del orquestador: pnpm test y pnpm test:coverage dieron 786 pasan + 7 fallas esperadas autorizadas = 793 (55 archivos); líneas globales 98,12 %, shared 97,36 %, services/auth 98,46 %, services/users 91,66 %. pnpm lint, pnpm typecheck y pnpm install --frozen-lockfile: código 0. Vitest, cobertura y E2E se ejecutaron en serie.
- E2E final del orquestador: 14 pasan y 2 no aplicables (solo casos móviles excluidos en desktop); incluye siete recorridos aplicables de la 003. Los puertos 3000, 3100, 4000 y 4100 quedaron libres.
- OpenAPI 3.1, contrato 0.3.1: validado con Redocly CLI 1.34.5 exacta, publicada el 2025-07-21, ejecutada desde una carpeta temporal sin incorporarla al proyecto. Código 0, 11 advertencias no bloqueantes aceptadas por R-003-08 (licencia, localhost, respuestas 4xx y componentes reutilizables). No se cambiaron políticas de seguridad ni dependencias del proyecto para validar.
- Configuración final: devin doctor confirmó los siete perfiles polleria-* sin errores. Los perfiles permiten leer salidas de sus comandos largos; la regla exige separación de archivos y turnos exclusivos de la base. Git diff --check pasó.
- La 003 se integró a main el 2026-10-08 (merge 80340c3): test/spec-003 e883802, feat shared/API de8f723, feat web 3dae0e7, docs f0d9c14. La prueba manual del PIN oculto en PowerShell y la validación desde un celular del local siguen pendientes.


- 2026-10-07: el entorno tiene Windows 11, Node 24.1.0 (LTS), pnpm 10.12.1, Git 2.49 y PostgreSQL 17.5 en localhost:5432. También hay un PostgreSQL 18 en el puerto 5433, que el proyecto no usa.
- 2026-10-07: HeroUI 3.2.6 exige Tailwind CSS >= 4, React >= 19 y react-aria-components.
- 2026-10-07: TypeScript 7 no es compatible con typescript-eslint 8.71.1 (< 6.1.0). Se fijó TypeScript 6.0.3.
- 2026-10-07: versiones exactas registradas en CLAUDE.md (sección Stack), según la Fase 0 y el ADR 0001.
- 2026-10-07: las preguntas abiertas de la enmienda 1 de la 001 se resolvieron con las recomendaciones: conexión a PostgreSQL sin SSL e ignorando la query del URL (S-12), la web no arranca si API_INTERNAL_URL trae usuario o clave (S-13), los errores 4xx no se registran en el log (S-14) y una migración espera sin límite a otra en curso (S-15).
- 2026-10-07: arbitraje. backend-dev reportó un glob sin barra en apps/api/tests/migrator.test.ts; el orquestador lo verificó y test-writer lo corrigió (commit 7c19265) sin cambiar aserciones.
- 2026-10-08: pnpm printer:test agregado a los comandos de CLAUDE.md.
- 2026-10-08: aclaración 1 de la spec 002 (commit 0484202): corte de líneas y espacios finales, conteo UTF-16 del límite de 2000, recorte de PRINTER_FILE_DIR. No cambió AC ni tests.
- 2026-10-08: registrado en CLAUDE.md bcrypt 6.0.0, @types/bcrypt 6.0.0 y el comando pnpm users:create-admin, conforme al cierre técnico de la 003. La integración a main sigue sin autorización.

## Deuda técnica y hallazgos medios/bajos

### Hallazgos adversariales de la 001 (commit 7be8d15; todos cerrados)

| ID | Severidad | Hallazgo | Estado |
| --- | --- | --- | --- |
| ADV-001-01 | Medio | Content-Encoding desconocido: body-parser lanza 415 y la API responde 500 INTERNAL_ERROR con traza en el log. | Cerrado (enmienda 1) |
| ADV-001-02 | Medio | Cuerpo que dice ser gzip y no lo es: 500 INTERNAL_ERROR con traza. | Cerrado (enmienda 1) |
| ADV-001-04 | Medio | La guardia acepta ?host=otro-servidor en una URL polleria_test y Sequelize conecta a ese host. | Cerrado (enmienda 1) |
| ADV-001-05 | Bajo | La guardia acepta ?options=-c search_path=... y Sequelize lo aplica. | Cerrado (enmienda 1) |
| ADV-001-06 | Bajo | Dos migrateUp simultáneos: uno falla con un error crudo del driver (el estado final queda bien). | Cerrado (enmienda 1) |
| ADV-001-09 | Bajo | API_INTERNAL_URL con ruta, query o fragmento rompe el destino del rewrite sin aviso. | Cerrado (enmienda 1) |

Ataques de la 001 sin fallas (quedan como regresión en verde): prototype pollution en JSON, 120 consultas de salud simultáneas con base disponible y caída, sin fugas de clave en errores, CLI ni salud.

### Hallazgos adversariales de la 002 (commit 0c62834; deuda autorizada por el usuario)

| ID | Severidad | Hallazgo | Estado |
| --- | --- | --- | --- |
| ADV-002-01 | Medio | Una línea válida con miles de acentos combinantes desordenados hace que normalizar tarde más de 2 s y bloquee Node (AC-17). | Deuda (Fase 3), test con it.fails |
| ADV-002-02 | Medio | createPrinterDriver se exporta desde index.ts y su print escribe tal cual ESC, GS y NUL si alguien lo usa sin el servicio. | Deuda (Fase 3), test con it.fails |
| ADV-002-03 | Bajo | El límite de 500 líneas se aplica después de recorrer todo el arreglo (100 000 líneas se leen enteras). | Deuda (Fase 3), test con it.fails |
| ADV-002-04 | Bajo | En Windows, PRINTER_FILE_DIR como Q:comandas o C: depende de la carpeta actual o cae en la raíz del monorepo. | Deuda (Fase 3), test con it.fails |
| ADV-002-05 | Bajo | toLimaDateTimeParts confunde años antes y después de Cristo (año 0 y año 1 dan 0001). | Deuda (Fase 3), test con it.fails |

Condiciones de esta deuda:
- ADV-002-02 debe corregirse ANTES de crear el driver escpos en la Fase 3; si no, sería inyección de comandos en la impresora (Crítico).
- ADV-002-01 sube a Alto si las observaciones de los ítems (Fase 2) aceptan más de unos 200 caracteres sin limitar acentos combinantes seguidos.
- ADV-002-01 depende de la velocidad de la máquina: en una PC unas 3 veces más rápida podría dejar de fallar y it.fails avisaría.
- it.fails da por buena cualquier falla, no solo la del hallazgo.

Ataques de la 002 sin fallas (regresión en verde): ningún punto de código Unicode sale fuera de los 114 imprimibles; comandos ESC/POS reales y trucos bidi, ZWJ y BOM no llegan al archivo por el servicio; jobId con trucos de rutas y nombres reservados de Windows se rechazan; 1000 impresiones simultáneas sin colisiones; fallas de escritura no dejan .txt ni .tmp; printer:test sin fugas de clave; Lima siempre UTC-5.

### Otras deudas bajas abiertas

- 001 (backend-dev y reviewer): si la clave de DATABASE_URL trae un escape % mal formado, loadConfig la acepta y createSequelize la rechaza con un mensaje seguro, pero cli.ts termina con un rechazo no controlado y traza (server.ts termina limpio). Se puede cerrar haciendo que loadConfig use getPostgresConnectionParts y moviendo createSequelize dentro del try de cli.ts.
- 001 (reviewer): la fila "error del lector con estado 5xx → 500 y se registra" de la tabla 9.2 no tiene test de regresión (error-handler.ts:56). Pendiente para test-writer.
- 001: si la base no responde, el E2E falla por el timeout de 120 s del webServer sin una pista clara; se sugiere que la API registre una línea en su log al no poder conectar.
- 002 (reviewer): print-document.ts:109 compara con un carácter TAB literal; cambiar a '\t' o String.fromCharCode(0x09) en un refactor.
- 002 (reviewer): printer.service.ts:85 lanza RangeError (no PrinterError) si se inyecta un reloj que da fecha inválida; tenerlo en cuenta en la Fase 3.
- 002 (reviewer): file-driver.ts usa node:timers/promises, que la lista de D-002-08 no menciona; actualizar la spec en la Fase 3.
- 002 (backend-dev): un grafema como ñ seguido de ZWJ pierde la tilde y sale n (D-002-04 paso 4d). Sigue la spec; muy raro.

### Notas y vigilancia

- packages/shared tiene pocas líneas medidas (93,75 %); poco margen sobre el umbral de 90 %. Vigilar en la 003, que agrega esquemas a shared.
- db-cli AC-24 de la 001 superó una vez su límite de 12 s con la máquina cargada (pasa solo en 9 s). Vigilar si se vuelve intermitente.
- La suite completa tarda unos 100 s; ADV-002-01 suma unos 9 s.
- Pendiente manual del usuario: probar pnpm dev desde un celular en el wifi del local y sin internet (sección 16 de la spec 001).
- Aviso de peer opcional: @vitest/mocker 5.0.3 declara msw ^2.4.9 y el proyecto usa msw 3.0.2. Funciona.
- Web: un 503 con status ok, o un 200 con status error, se interpreta como unreachable (deben coincidir el código HTTP y el status).
- Producción: los rewrites de Next se calculan en next build, así que API_INTERNAL_URL debe estar definida al compilar (para la guía de instalación).
- R-09 de la 001: en Vitest 5 el umbral global de 80 % incluye también shared y services; es más estricto que el texto de la spec.
- Resuelto: Next 16.4.0 generaba apps/web/AGENTS.md cuando un agente corría next dev (agentRules: false en next.config.ts).
- Resuelto: apps/web usa zod 4.6.5 (librería ya aprobada) para loadWebServerConfig.

## Bloqueos

Ninguno.

Historial: el 2026-10-07 faltaba apps/api/.env; el usuario lo creó. Su clave real había quedado también en apps/api/.env.example, que se versiona; el orquestador restauró ese archivo antes de cualquier commit y verificó que el historial de git nunca tuvo la clave.
