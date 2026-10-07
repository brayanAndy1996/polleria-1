# ADR 0001 — Stack, versiones y dependencias de soporte

- Estado: Propuesto
- Fecha: 2026-10-07
- Spec relacionada: docs/specs/001-base-monorepo/spec.md
- Decide: el usuario (aprobación pendiente). Al cerrar la spec 001, el orquestador registra en CLAUDE.md las versiones finalmente instaladas.

## Contexto

CLAUDE.md pide fijar versiones exactas del stack en la Fase 0 y justificar en docs/decisions/ cualquier dependencia que no esté en su lista aprobada. El orquestador verificó el entorno el 2026-10-07: Node 24.1.0 (LTS), pnpm 10.12.1 y PostgreSQL 17.5 en localhost:5432 (hay un PostgreSQL 18 en el puerto 5433 que no se usa). El spec-writer consultó el registro de npm el mismo día para versiones, peerDependencies y engines, y verificó en Node 24.1.0 y en el paquete de Next 16.4.0 los comportamientos en los que se apoya esta decisión.

## Decisión

### 1. Runtime y gestor de paquetes

| Herramienta | Versión | Cómo se fija |
| --- | --- | --- |
| Node.js | 24.1.0 (LTS, ya instalado) | `"engines": { "node": ">=24.1.0 <25" }` en el package.json raíz |
| pnpm | 10.12.1 | `"packageManager": "pnpm@10.12.1"` |
| PostgreSQL | 17.5 (localhost:5432) | Instalación local; bases polleria_dev y polleria_test creadas por el usuario |
| TypeScript | 6.0.3 | Ver la sección 3.1 |

Todas las versiones se escriben exactas (sin ^ ni ~), con `save-exact=true` en .npmrc. El paquete interno usa `workspace:*`.

### 2. Versiones por paquete

Aprobadas en CLAUDE.md (stack):

| Paquete | Versión | Dónde |
| --- | --- | --- |
| next | 16.4.0 | web |
| react, react-dom | 19.3.0 | web |
| @heroui/react | 3.2.6 | web |
| tailwindcss | 4.3.3 | web |
| @tanstack/react-query | 5.104.1 | web |
| msw | 3.0.2 | web (dev) |
| express | 5.2.1 | api |
| sequelize | 6.37.8 | api |
| zod | 4.6.5 | shared, api |
| typescript | 6.0.3 | raíz (dev) |
| vitest | 5.0.3 | raíz (dev) |
| supertest | 7.3.1 | api (dev) |
| @testing-library/react | 16.3.3 | web (dev) |
| @playwright/test | 1.64.0 | raíz (dev) |
| eslint | 10.12.0 | raíz (dev); pedido para la Fase 0 en orquestador.md |
| prettier | 3.9.9 | raíz (dev); pedido para la Fase 0 en orquestador.md |

Diferidas (aprobadas, se instalan cuando una spec las use): socket.io 4.8.4 y socket.io-client, bcrypt, node-thermal-printer 4.6.1, fast-check 4.10.2 y openapi-typescript 7.13.0.

### 3. Decisiones derivadas

**3.1. TypeScript 6.0.3 y no 7.0.2.** TypeScript 7.0.2 es latest, pero typescript-eslint 8.71.1 exige `typescript >=4.8.4 <6.1.0`. Se fija 6.0.3, la última 6.0.x. Se revisará cuando typescript-eslint soporte la 7.

**3.2. Type stripping nativo de Node 24 en lugar de tsx o ts-node.** Verificado en Node 24.1.0: ejecuta .ts directamente y muestra un ExperimentalWarning (se oculta con `--disable-warning=ExperimentalWarning`). Exige sintaxis borrable (`erasableSyntaxOnly`): sin enum, namespace, propiedades de parámetro ni decoradores, e imports relativos con extensión .ts. Verificado también que un enum hace fallar el arranque. Riesgo: la función es "release candidate" en Node 24; si diera problemas, la alternativa es tsx (requeriría aprobación).

**3.3. packages/shared sin compilación.** Exporta ./src/index.ts. Verificado en un workspace pnpm con Node 24.1.0: la API importa el paquete sin paso de build. Next.js lo compila con transpilePackages y Vitest lo transforma directamente.

**3.4. Variables de entorno sin dotenv.** `node --env-file-if-exists=.env` en los scripts de la API (el entorno tiene prioridad sobre el archivo, verificado) y `process.loadEnvFile` o `util.parseEnv` en Vitest y Playwright (loadEnvFile no sobrescribe variables existentes, verificado).

**3.5. Migraciones con umzug y no con sequelize-cli.** umzug 3.8.3 con SequelizeStorage permite migraciones en TypeScript y una API programática que las pruebas usan sobre polleria_test. sequelize-cli espera migraciones en JavaScript y su configuración propia.

**3.6. Web y API en el mismo origen.** Next.js reenvía /api/* a la API con rewrites; no hace falta el paquete cors y la futura cookie httpOnly funciona sin configurar orígenes que dependen de la IP de la PC. Verificado en el código de Next 16.4.0 que los rewrites externos también reenvían WebSocket (necesario para Socket.IO más adelante).

**3.7. jsdom 29.1.1 y no 30.1.2.** jsdom 30 declara `engines.node: ^22.22.2 || ^24.15.0 || >=26.0.0`; con Node 24.1.0 no corresponde. jsdom 29.1.1 acepta `>=24.0.0`. Si el usuario actualiza Node a 24.15 o superior, se puede subir a jsdom 30.

**3.8. openapi-typescript diferido.** La 7.13.0 declara `typescript ^5.x` como peerDependency y el proyecto fija 6.0.3. En la spec 001 no es necesario (la salud se tipa con el esquema Zod de packages/shared). La spec que lo instale debe decidir entre aceptar el aviso de peer (pnpm `peerDependencyRules.allowedVersions`) o esperar una versión compatible.

**3.9. pg-hstore no se instala.** Revisado el código de sequelize 6.37.8: `require("pg-hstore")` solo ocurre al usar el tipo HSTORE (carga perezosa en data-types.js). sequelize lo declara como peerDependency opcional.

**3.10. Compatibilidad de navegadores.** Next 16.4.0 compila para Chrome 111+, Edge 111+, Firefox 111+ y Safari 16.4+ (MODERN_BROWSERSLIST_TARGET en el paquete); Tailwind 4 exige el mismo piso. Android 9 llega hasta Chrome 138 según el anuncio de Google (verificar), así que el stack es compatible con Android 9 si Chrome está actualizado. Toda actualización mayor de Next, Tailwind o HeroUI debe revisar que el piso no supere Chrome 138.

**3.11. Sin Docker.** PostgreSQL local en Windows, como dice CLAUDE.md. Docker queda como mejora futura con su propio ADR.

## Dependencias de soporte que requieren aprobación

Son los paquetes necesarios que no están en la lista aprobada de CLAUDE.md. La misma lista está en la sección 12 de la spec 001.

### A. Complementos obligatorios de librerías ya aprobadas

| Paquete | Versión | Dónde | Justificación |
| --- | --- | --- | --- |
| pg | 8.23.1 | api | Driver de PostgreSQL que Sequelize exige para el dialecto postgres. |
| @heroui/styles | 3.2.6 | web | Estilos de HeroUI v3 importados desde globals.css; con pnpm debe ser dependencia directa. |
| react-aria-components | 1.21.1 | web | peerDependency de @heroui/react 3.2.6. |
| react-aria | 3.52.1 | web | peerDependency de @heroui/react 3.2.6. |
| @react-aria/ssr | 3.10.1 | web | peerDependency de @heroui/react 3.2.6. |
| @react-aria/utils | 3.34.1 | web | peerDependency de @heroui/react 3.2.6. |
| @internationalized/date | 3.12.4 | web | peerDependency de @heroui/react 3.2.6. |
| @tailwindcss/postcss | 4.3.3 | web | Integración oficial de Tailwind 4 con Next.js. |
| postcss | 8.5.29 | web | Requerido por @tailwindcss/postcss según la guía de Tailwind para Next.js. |
| @testing-library/dom | 10.4.2 | web | peerDependency obligatoria de @testing-library/react 16. |
| typescript-eslint | 8.71.1 | raíz | Parser y reglas de ESLint para TypeScript. |
| @eslint/js | 10.0.1 | raíz | Reglas recomendadas de ESLint 10 en configuración plana. |

### B. Herramientas de soporte

| Paquete | Versión | Dónde | Justificación |
| --- | --- | --- | --- |
| umzug | 3.8.3 | api | Migraciones y seeds en TypeScript con API programática (3.5). |
| @vitest/coverage-v8 | 5.0.3 | raíz | Cobertura y umbrales de la definición de terminado; debe coincidir con vitest. |
| jsdom | 29.1.1 | raíz | Entorno de navegador para pruebas de componentes (3.7). |
| @types/node | 24.19.1 | raíz, api | Tipos de Node de la línea 24. |
| @types/express | 5.0.6 | api | Tipos de Express 5. |
| @types/supertest | 7.2.1 | api | Tipos de Supertest. |
| @types/react | 19.3.0 | web | React 19 no trae tipos propios. |
| @types/react-dom | 19.3.0 | web | React DOM 19 no trae tipos propios. |

### C. Opcionales

| Paquete | Versión | Dónde | Justificación |
| --- | --- | --- | --- |
| eslint-plugin-react-hooks | 7.1.1 | raíz | Detecta errores en hooks. Compatible con ESLint 10. Recomendada. |
| @testing-library/jest-dom | 7.0.1 | web | Comparadores legibles para pruebas de componentes. Útil desde la Fase 2; no la necesita la spec 001. |

### D. Descartadas por existir una capacidad nativa o por no hacer falta

dotenv, tsx, ts-node, nodemon, concurrently, cross-env, cors, sequelize-cli, pg-hstore, eslint-config-prettier, eslint-config-next, @vitejs/plugin-react, happy-dom y @testing-library/user-event. Motivos en la sección 12.5 de la spec 001.

## Alternativas consideradas

| Tema | Elegido | Alternativa | Por qué no |
| --- | --- | --- | --- |
| TypeScript | 6.0.3 | 7.0.2 | Incompatible con typescript-eslint 8.71.1. |
| Ejecutar TS en Node | Type stripping nativo | tsx | Una dependencia más; Node 24 ya lo hace. |
| Paquete shared | Código fuente (sin build) | Compilar a dist con tsc | Obliga a compilar antes de dev, test y typecheck. |
| Migraciones | umzug | sequelize-cli | Migraciones en JS y sin API programática cómoda para las pruebas. |
| .env | Opciones nativas de Node | dotenv | Node 24 ya lo trae. |
| Procesos en paralelo | `pnpm -r --parallel` | concurrently | pnpm ya lo trae. |
| Web y API | Mismo origen con rewrites | CORS con credenciales | Depende de la IP de la PC; complica la cookie httpOnly. |
| DOM en pruebas | jsdom 29.1.1 | happy-dom 20.14.5 | jsdom es la referencia de React Testing Library y MSW. |
| Base de datos | PostgreSQL local | Docker | CLAUDE.md lo deja como mejora futura. |

## Consecuencias

- Positivas: menos dependencias, sin paso de compilación para la API ni para shared, scripts que funcionan igual en Windows, y pruebas de integración y E2E contra PostgreSQL real sin tocar polleria_dev.
- Negativas: sintaxis TypeScript limitada (sin enum ni decoradores); ExperimentalWarning oculto con una opción de Node; `pnpm dev` debe detenerse antes de `pnpm test:e2e`; jsdom queda una versión mayor atrás mientras se use Node 24.1.0.
- Riesgos: type stripping en estado "release candidate" en Node 24; posible fricción de peerDependencies entre TypeScript 6 y herramientas que aún declaran `^5.x`; piso de Chrome 111 frente a celulares Android 9 sin actualizar.

## Pendientes

- Aprobación del usuario de las listas A y B, y elección sobre la lista C.
- Respuesta del usuario sobre actualizar Node a la última 24.x (permitiría jsdom 30).
- Al cerrar la spec 001, registrar en CLAUDE.md las versiones finales (`pnpm -r ls --depth 0`) y cambiar este ADR a "Aceptado".
