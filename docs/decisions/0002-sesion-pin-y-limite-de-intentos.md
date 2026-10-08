# ADR 0002 — Sesión guardada en la base, PIN con bcrypt y límite de intentos propio

- Estado: Propuesto
- Fecha: 2026-10-08
- Spec relacionada: docs/specs/003-users-pin-login/spec.md (D-003-01 a D-003-05, sección 13)
- Decide: el usuario, en el punto de control de la spec 003.

## Contexto

La spec 003 agrega usuarios con PIN, sesión en cookie httpOnly, protección de rutas por rol y un límite de intentos de PIN. CLAUDE.md ya aprueba bcrypt para el PIN. backend-dev.md menciona "sesión con JWT en cookie httpOnly" y la nota de D-01 de la spec 001 habla de una "futura sesión JWT", pero ninguna librería de JWT, de cookies ni de límite de intentos está aprobada. Hay que decidir cómo se hace cada pieza con la menor cantidad de dependencias y el menor riesgo.

Hechos verificados el 2026-10-08 en esta PC (Windows 11, Node 24.1.0, pnpm 10.12.1) y en el registro de npm:
- bcrypt 6.0.0 (latest) declara `engines.node >= 18`, depende de node-addon-api ^8.3.0 y node-gyp-build ^4.8.4, y su paquete trae binarios precompilados N-API en prebuilds/ para win32-x64, win32-arm64, linux (glibc y musl) y darwin. Su script `install` es `node-gyp-build`, que compila desde el código fuente solo si no encuentra un binario.
- Instalado con pnpm 10.12.1 sin aprobar su script (pnpm avisa "Ignored build scripts: bcrypt"), `hash` y `compare` funcionan: node-gyp-build carga el binario precompilado al usarlo. Costo 10: unos 50 ms por hash y por comparación. `compare` con un hash mal formado devuelve false, sin lanzar.
- Con `ignoredBuiltDependencies: [bcrypt]` en pnpm-workspace.yaml el aviso desaparece y bcrypt sigue funcionando.
- @types/bcrypt 6.0.0 depende de `@types/node: *`. En un proyecto que ya tiene @types/node 24.19.1 como dependencia directa, pnpm la resuelve con esa misma versión (no trae una segunda).
- Next 16.4.0 reenvía /api con httpxy sin la opción xfwd: la API no recibe la IP del celular, todas las solicitudes llegan desde 127.0.0.1, y una cabecera X-Forwarded-For llegaría tal como la mande el cliente.
- Express 5.2.1 escribe cookies con `res.cookie` y las borra con `res.clearCookie` sin paquetes extra; no las lee (`req.cookies` no existe sin cookie-parser).
- pnpm 10.12.1, con `--filter` y un solo paquete, ejecuta el script con stdio "inherit": un comando interactivo lanzado desde la raíz recibe la terminal real.
- react-aria 3.52.1 (base de HeroUI 3.2.6) trata un `click` sin puntero previo (como `fireEvent.click` de Testing Library) como clic virtual y dispara onPress.

## Decisión

### 1. PIN con bcrypt 6.0.0 (aprobada en CLAUDE.md)

- bcrypt 6.0.0 en dependencies de apps/api, costo 10 (`PIN_HASH_COST`).
- pnpm-workspace.yaml: `ignoredBuiltDependencies: [bcrypt]`. No se usa onlyBuiltDependencies porque el script de instalación solo sirve para compilar desde el código fuente, lo que en Windows exige Python y Visual Studio Build Tools. Si algún día bcrypt no trajera binario para la plataforma, la instalación seguiría pero bcrypt fallaría al cargarse: se detectaría en la primera prueba.

### 2. Sesión: token aleatorio guardado como hash en la base (sin dependencias)

- Token de 32 bytes de `crypto.randomBytes` en base64url, en la cookie `polleria_session`. La base guarda solo `sha256(token)` en la tabla sessions, con su vencimiento (16 horas).
- requireAuth busca la sesión por ese hash y carga al usuario en la misma consulta: rol y estado activo siempre al día.
- Cerrar sesión borra la fila. No hay clave de firma ni variable de entorno nueva.

### 3. Cookies: escritura con Express y lectura propia (sin dependencias)

- `res.cookie` y `res.clearCookie` de Express 5.
- `readSessionCookie(cabecera)`: busca la primera cookie llamada exactamente `polleria_session` en la cabecera Cookie. Es una función pura de pocas líneas con pruebas propias (AC-11 de la spec 003).

### 4. Límite de intentos propio, por usuario y en memoria (sin dependencias)

- 5 intentos fallidos seguidos bloquean al usuario 15 minutos; después, cada fallo lo vuelve a bloquear; un éxito borra el conteo. El intento se cuenta antes de comparar el PIN para que solicitudes simultáneas no se salten el límite.
- Vive en la memoria del proceso de la API (una sola instancia). Reiniciar la API borra los bloqueos.

### 5. Sin cambios en las herramientas de la web

- Sin @testing-library/user-event: `fireEvent.click` basta para los botones de HeroUI (verificado en react-aria 3.52.1).
- openapi-typescript 7.13.0 sigue diferido: todavía declara `typescript ^5.x` y el proyecto usa 6.0.3. La web tipa con los esquemas Zod de @polleria/shared.

## Dependencias de soporte que requieren aprobación

| Paquete | Versión | Dónde | Justificación |
| --- | --- | --- | --- |
| @types/bcrypt | 6.0.0 | api (devDependencies) | bcrypt no trae tipos propios; sin ellos TypeScript strict no compila el PinHasher. Sin dependencias propias más allá de @types/node, que se resuelve con la 24.19.1 del proyecto. |

Se instala además bcrypt 6.0.0 (ya aprobada en CLAUDE.md, diferida desde el ADR 0001).

## Alternativas consideradas

| Tema | Elegido | Alternativa | Versión consultada | Por qué no |
| --- | --- | --- | --- | --- |
| Hash del PIN | bcrypt 6.0.0 | bcryptjs 3.0.3 (JavaScript puro) | 3.0.3 | CLAUDE.md aprueba bcrypt y funciona en Windows con binario precompilado; bcryptjs sería otra aprobación sin ganancia. |
| Hash del PIN | bcrypt 6.0.0 | scrypt de node:crypto | Node 24.1.0 | Nativo y sin dependencias, pero CLAUDE.md pide bcrypt; cambiarlo requiere aprobación y no mejora la seguridad de un PIN corto (lo protege el límite de intentos). |
| Sesión | Token en la base | jose (JWT, sin dependencias, ESM) | 6.2.12 | Necesita SESSION_SECRET en .env (cambio para el usuario y para las pruebas de configuración de la 001 y la 002); cerrar sesión no invalida el token; requireAuth igual consulta la base para el rol y el estado. |
| Sesión | Token en la base | jsonwebtoken (CommonJS) | 9.0.3 (10 dependencias: jws, semver, ms, lodash.*) | Lo mismo que jose, con más dependencias. |
| Sesión | Token en la base | JWT o HMAC propio con node:crypto y SESSION_SECRET | Node 24.1.0 | Sin dependencias, pero mantiene el secreto y el problema del cierre de sesión, y suma código criptográfico propio (comparación en tiempo constante, formato). |
| Leer cookies | Función propia | cookie-parser | 1.4.7 (última versión de 2024; depende de cookie 0.7.2 y cookie-signature 1.0.6) | Solo se lee una cookie; no se usan cookies firmadas. |
| Leer cookies | Función propia | cookie | 2.0.1 (engines node >= 22) | Igual que el anterior: una dependencia para algo que es dividir una cabecera. |
| Límite de intentos | Propio por usuario | express-rate-limit | 8.7.1 (peer express >= 4.11; depende de debug e ip-address) | Cuenta por IP y detrás del reenvío de Next todas las solicitudes vienen de 127.0.0.1; no sabe si el PIN fue correcto; contar por usuario exige reescribir su lógica igual. |
| Clics en pruebas | fireEvent | @testing-library/user-event | 14.6.7 | No hace falta (verificado en react-aria 3.52.1). |
| Tipos del contrato | Esquemas Zod de shared | openapi-typescript | 7.13.0 (peer typescript ^5.x) | Conflicto con TypeScript 6.0.3 (sigue igual que en el ADR 0001). |

## Consecuencias

- Positivas: una sola dependencia nueva de soporte (tipos); el usuario no tiene que tocar apps/api/.env; cerrar sesión, desactivar o cambiar el rol de un usuario valen al instante; ninguna copia de la base ni del .env permite fabricar una sesión.
- Negativas: una consulta a la base por cada solicitud protegida (insignificante en el local); los bloqueos por intentos se borran al reiniciar la API; la tabla sessions acumula sesiones vencidas hasta el siguiente inicio de sesión exitoso.
- Riesgos: si bcrypt dejara de publicar binarios para win32-x64, la instalación en otra PC necesitaría herramientas de compilación; si en el futuro hay varias instancias de la API, el límite de intentos debe pasar a la base.
- Si el usuario prefiere JWT: agregar SESSION_SECRET (Zod, mínimo 32 caracteres, la API no arranca sin ella), aprobar jose 6.2.12 o escribir el HMAC con node:crypto, y ajustar AC-04 y AC-07 de la 001, AC-02 y AC-05 de la 002 y las pruebas de procesos que arrancan la API.

## Pendiente para el orquestador al aprobarse

- Actualizar en .claude/agents/backend-dev.md "sesión con JWT en cookie httpOnly" y en .claude/agents/adversarial-tester.md "JWT manipulado" (sección 12 de la spec 003).
- Registrar en CLAUDE.md (Stack) bcrypt 6.0.0 y @types/bcrypt 6.0.0 al cerrar la spec 003.
