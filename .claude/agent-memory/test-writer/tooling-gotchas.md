---
name: tooling-gotchas
description: Trampas de herramientas ya encontradas al escribir pruebas en este monorepo (MSW 3, Vite en jsdom, Playwright, tool Bash)
metadata:
  type: feedback
---

Reglas aprendidas escribiendo la fase roja de la spec 001. Evitan repetir errores de configuración.

- MSW 3.0.2: `server.listen({ onUnhandledFrame: 'error' })`. La opción `onUnhandledRequest` ya no existe y rompe el typecheck.
  **Why:** el tipo SharedOptions de msw 3 solo declara `onUnhandledFrame`.
  **How to apply:** en `frontend/tests/setup.ts` y en cualquier setup nuevo de MSW.
- En el proyecto web (jsdom) Vite transforma `new URL('./x', import.meta.url)` como un asset y falla con "Failed to resolve import". Usar `path.resolve(import.meta.dirname, ...)` para ubicar archivos (.env.example, fixtures) en todos los tests.
  **Why:** `vite:asset-import-meta-url` actúa en entornos tipo cliente.
  **How to apply:** en cualquier test o helper que lea archivos por ruta.
- Playwright no resuelve `@polleria/shared` desde `e2e/` (la raíz no lo declara). Importar por ruta relativa: `../packages/shared/src/index.ts`. Tampoco hay tipos DOM en el tsconfig raíz: usar `page.evaluate<T>('expresión como texto')`.
- El tool Bash falla ("unexpected EOF") con algunos heredocs largos con comillas y plantillas; crear los archivos con Write en su lugar.
- umzug 3.8.3 usa tinyglobby: un glob absoluto con barras normales (`C:/.../*.ts`) funciona en Windows.
- Globs armados con `path.join(dir, carpeta)` no llevan barra final: concatenar `/*.ts` (con barra), nunca `*.ts`. El error (`.../migrations*.ts`) pasó sin detectarse en `migrator.test.ts` porque esos tests necesitan PostgreSQL y no se ejecutaron en la fase roja.
  **Why:** devolvía `[]` sin error y habría roto 5 tests (AC-22, AC-23) aunque el migrador estuviera bien; lo halló backend-dev.
  **How to apply:** en tests que dependen de la base, comprobar a mano cualquier glob o ruta con umzug de almacenamiento en memoria (sin base) desde el scratchpad: `new Umzug({ migrations: { glob }, context: {}, storage: <objeto en memoria> }).pending()`.
- En scripts de Bash con heredoc, la barra invertida (`'\\'`) se pierde: para scripts de prueba en el scratchpad usar Write y `String.fromCharCode(92)`.
- Fixtures de migraciones/seeders: sin imports de valores de `sequelize` (solo `import type`), SQL directo con `context.sequelize.query`. Cargan bien con el type stripping de Node 24.1.
- Supertest/superagent con `Content-Type: application/json` serializa un Buffer con JSON.stringify (`{"type":"Buffer","data":[...]}`): un gzip válido llega corrupto y la API responde 500. Para enviar bytes tal cual usar el helper `backend/tests/helpers/raw-body.ts` (`sendRawBody`, que usa `.serialize`). Los strings no tienen el problema.
  **Why:** en la enmienda 1 los tests de AC-36 (cuerpos comprimidos válidos) fallaban con 500 por esto, no por la API; y los de AC-34 habrían pasado por casualidad con bytes que no eran los previstos.
  **How to apply:** cualquier test que mande cuerpo binario o comprimido con tipo JSON.
- backend usa `erasableSyntaxOnly`: no hay propiedades en el constructor (`constructor(private x: T)`), ni enums. Declarar el campo y asignarlo.
- Para inspeccionar `polleria_test` sin mostrar la clave: script en el scratchpad con `createRequire('<repo>/backend/package.json')` para cargar `pg`, `parseEnv` sobre backend/.env, verificar que la base termine en `_test` y imprimir solo nombres de tablas.
- Bloqueos consultivos en pruebas: `pg_advisory_xact_lock` dentro de una transacción no administrada de Sequelize y `commit()` para soltar; comparte el espacio de claves con `pg_advisory_lock`. Registrar las promesas en vuelo y esperarlas en afterEach antes de limpiar tablas. Ver `backend/tests/helpers/advisory-lock.ts`.
- Una prueba de concurrencia sin el bloqueo (p. ej. dos `migrateDown` simultáneos) puede pasar por casualidad en rojo: es una carrera, no un error de la prueba.
- Las herramientas Write/Edit convierten los escapes `\uXXXX` de 4 dígitos hexadecimales en el carácter real al guardar el archivo (no toca los controles U+0000-U+001F y U+007F-U+009F, los sustitutos sueltos ni la forma `\u{1F44D}`). Resultado: acentos combinantes, ZWJ, U+00A0, U+2028/2029, BOM y similares quedan LITERALES e invisibles en el código de prueba.
  **Why:** en la spec 002 la mitad de las tablas de normalización (NFD, espacios Unicode, formatos) quedaron literales sin que nada fallara; solo se vio al hacer `grep u2028` y no encontrar nada.
  **How to apply:** después de escribir pruebas con caracteres especiales, correr un script (escrito con Write, sin teclear `\u` seguido de hex: armar la barra con `String.fromCharCode(92)`) que reemplace todo carácter no ASCII, salvo las letras españolas permitidas, por su escape; luego `prettier --write` y un script que verifique NFC y que no queden literales raros. Comando `node -e` con `\u` en el texto también se corrompe: usar archivos .mjs.
- Zod 4.6.5: `z.string().max(n)` cuenta puntos de código, no unidades UTF-16. Si una spec dice "medido con `.length`" (emojis cuentan 2), usar `.refine((v) => v.length <= n)`. Una prueba con `'\u{1F600}'.repeat(1001)` lo detecta.
- `packages/shared` tiene `types: []`: `process` no existe en sus pruebas. Para cambiar `process.env.TZ` usar `vi.stubEnv('TZ', ...)` y `vi.unstubAllEnvs()` (cambia la zona de verdad en el pool de forks).
- `pnpm typecheck` raíz se detiene en el primer paquete que falla (`pnpm -r`): para ver los errores de la API en fase roja correr `pnpm --filter @polleria/api run typecheck` aparte.
- Una prueba de la 001 (db-cli AC-24, `migrate` con límite de 12 s) falló una vez en la corrida completa cuando la máquina iba lenta (86 s en vez de 33 s) y pasa sola en 9 s: es carga, no regresión. Repetir ese archivo antes de culpar a la prueba nueva.
- `no-unsafe-*` de ESLint (recommendedTypeChecked) marca en cascada todo valor que viene de un módulo inexistente: en fase roja `pnpm lint` no puede dar 0. Se demuestra que es solo cascada validando contra una implementación desechable (ver [[validar-rojo-con-copia-desechable]]).
