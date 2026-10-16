# Sistema Pollería — Constitución del proyecto

> Codex: desde 2026-10-12, la metodología reducida aprobada en AGENTS.md y docs/agents/modelos-codex.md prevalece sobre las referencias históricas de roles de este archivo: principal redacta/revisa, test-writer conserva TDD y regresiones, implementer cubre backend/frontend. Sin ronda adversarial ni reviewer independientes. Reglas de dominio y criterios de calidad siguen vigentes.

Sistema para pollerías pequeñas de Huánuco (Perú): mesas, pedidos, comandas impresas en cocina, caja, inventario y reportes. Es un prototipo para presentar al dueño de una pollería.

Fuente de requerimientos: docs/planificacion.md (historias de usuario, propuesta, RF y RNF).

## Stack (fijar versiones exactas en la Fase 0 y registrarlas aquí)

- Monorepo con pnpm workspaces. TypeScript en modo strict en todo el proyecto.
- apps/web: Next.js (App Router), HeroUI, Tailwind CSS. Antes de instalar, verificar en la documentación oficial de HeroUI qué versión de Tailwind requiere y fijar ambas.
- apps/api: Node.js LTS, Express, Sequelize con migraciones, PostgreSQL 17, Socket.IO, Zod.
- packages/shared: tipos, esquemas Zod, constantes y funciones puras de dominio.
- Librerías complementarias aprobadas: TanStack Query y socket.io-client (web), bcrypt (PIN), node-thermal-printer o equivalente ESC/POS (impresión), openapi-typescript (tipos del contrato), MSW (mocks de la API en la web).
- Pruebas: Vitest, Supertest, React Testing Library, Playwright, fast-check.
- Infraestructura: PostgreSQL 17 (17.5) instalado localmente en Windows (sin Docker por ahora). Ver la sección "Base de datos local".
- Agregar cualquier otra dependencia requiere justificarla en docs/decisions/ y aprobación del usuario.

### Versiones fijadas (Fase 0, 2026-10-07; detalle y justificación en docs/decisions/0001-stack-y-versiones.md)

Todas exactas (sin ^ ni ~, .npmrc con save-exact=true). Cambiar una versión mayor requiere ADR y aprobación del usuario.

- Entorno: Node.js 24.1.0 (engines ">=24.1.0 <25"), pnpm 10.12.1 (packageManager), PostgreSQL 17.5 en localhost:5432.
- Raíz: typescript 6.0.3 (no la 7: typescript-eslint solo soporta < 6.1.0), eslint 10.12.0, @eslint/js 10.0.1, typescript-eslint 8.71.1, eslint-plugin-react-hooks 7.1.1, prettier 3.9.9, vitest 5.0.3, @vitest/coverage-v8 5.0.3, jsdom 29.1.1, @playwright/test 1.64.0, @types/node 24.19.1.
- packages/shared: zod 4.6.5.
- apps/api: express 5.2.1, sequelize 6.37.8, pg 8.23.1, umzug 3.8.3 (migraciones y seeds; reemplaza a sequelize-cli), zod 4.6.5, bcrypt 6.0.0 (ADR 0002); dev: supertest 7.3.1, @types/express 5.0.6, @types/supertest 7.2.1, @types/bcrypt 6.0.0.
- apps/web: next 16.4.0, react 19.3.0, react-dom 19.3.0, @heroui/react 3.2.6, @heroui/styles 3.2.6, react-aria-components 1.21.1, react-aria 3.52.1, @react-aria/ssr 3.10.1, @react-aria/utils 3.34.1, @internationalized/date 3.12.4, @tanstack/react-query 5.104.1, zod 4.6.5; dev: tailwindcss 4.3.3 (HeroUI 3 exige Tailwind >= 4), @tailwindcss/postcss 4.3.3, postcss 8.5.29, @testing-library/react 16.3.3, @testing-library/dom 10.4.2, @testing-library/jest-dom 7.0.1, msw 3.0.2, @types/react 19.3.0, @types/react-dom 19.3.0.
- Aprobadas pero aún no instaladas (se fijan al usarlas): socket.io 4.8.4 y socket.io-client, node-thermal-printer 4.6.1, fast-check 4.10.2, openapi-typescript (declara typescript ^5 como peer; resolver al instalarla).
- La API y shared corren con el type stripping nativo de Node 24 (sin tsx ni compilación): solo sintaxis borrable (sin enum, namespace, parameter properties ni decoradores) e imports relativos con extensión .ts.

## Estructura

- apps/web — frontend
- apps/api — backend (routes -> controllers -> services -> models)
- packages/shared — dominio compartido
- docs/planificacion.md — requerimientos originales
- docs/api/openapi.yaml — contrato de la API (fuente de verdad entre front y back)
- docs/specs/NNN-nombre/ — spec.md, tasks.md por funcionalidad
- docs/decisions/ — decisiones de arquitectura (ADR)
- docs/PROGRESS.md — estado del proyecto, lo mantiene el orquestador
- tests de API en apps/api/tests, unitarios junto al código (*.test.ts), adversariales en */tests/adversarial, E2E en e2e/

## Base de datos local (sin Docker)

El usuario crea las bases a mano; ningún agente crea, borra ni recrea bases de datos ni roles de PostgreSQL.

| Uso | Base | Usuario | Variable en apps/api/.env |
| --- | --- | --- | --- |
| Desarrollo | polleria_dev | polleria | DATABASE_URL |
| Pruebas | polleria_test | polleria | DATABASE_URL_TEST |

- Servidor: localhost:5432. Formato: postgres://polleria:<clave>@localhost:5432/<base>.
- La clave vive solo en apps/api/.env (no versionado). apps/api/.env.example se versiona con un valor de ejemplo.
- Los tests usan siempre DATABASE_URL_TEST. Antes de truncar o hacer sync({ force: true }), el código de pruebas verifica que el nombre de la base termine en _test y aborta si no; así nunca se borran datos de desarrollo.
- Migraciones y seeds de demo corren sobre polleria_dev; los tests aplican las migraciones sobre polleria_test.
- Si una base no existe o la conexión falla, el agente se detiene y lo reporta al orquestador; no intenta arreglarlo con permisos de superusuario.
- Docker queda como mejora futura; si se agrega, requiere un ADR en docs/decisions/.

## Reglas de dominio (no negociables)

1. El pollo se mide en octavos como entero. 1 pollo = 8 octavos = 4 de pecho + 4 de pierna. 1/8 = 1 octavo, 1/4 = 2 octavos de una parte, 1/2 = 4 octavos (por defecto 2 de pecho + 2 de pierna, configurable), entero = 8.
2. El dinero se guarda y calcula en céntimos de sol como entero (S/ 18.50 = 1850). Prohibido usar float para dinero. Todas las entradas e importes visibles se expresan en soles con decimales (21.5 o 21,5 → S/ 21,50); los céntimos enteros quedan internos.
3. Todo descuento de stock ocurre dentro de una transacción con bloqueo de fila (SELECT ... FOR UPDATE). El stock nunca puede quedar negativo.
4. El precio de cada ítem se copia al pedido al momento de registrarlo; cambiar el precio de la carta no altera pedidos abiertos.
5. Enviar un pedido es idempotente: cada envío lleva una clave única (Idempotency-Key) y un reenvío no duplica ítems, comandas ni stock.
6. Anular un ítem enviado a cocina requiere autorización de un administrador y queda registrado en auditoría con motivo, usuario y hora.
7. La impresión siempre pasa por PrinterService. Drivers: file (desarrollo y pruebas, escribe en tmp/comandas) y escpos (producción, impresora térmica de red de 80 mm). Excepción manual aprobada en la spec 014: la pre-cuenta se imprime mediante el diálogo del navegador y no genera una comanda ni un pago.
8. Zona horaria America/Lima para fechas, cierres de caja y reportes.
9. El sistema debe funcionar en la red local sin internet.

## Glosario (español -> código)

mozo = waiter, cocina = kitchen, cajero = cashier, administrador = admin, mesa = table, pedido = order, ítem = orderItem, comanda = kitchenTicket, carta = menu, producto = product, presentación = portion (eighth, quarter, half, whole), parte = cut (breast, leg), cremas = sauces, combo = combo, bebida = drink, insumo = supply, caja = cashRegister, cobro = payment, vuelto = change, pre-cuenta = bill, anulación = voidItem, merma = waste.

## Idioma

- Código (variables, funciones, tablas, endpoints): inglés, usando el glosario.
- Textos de interfaz, mensajes de error al usuario y documentación: español de Perú, sencillo.

## Flujo de trabajo (SDD + TDD)

Spec (spec-writer) -> aprobación del usuario -> tests en rojo (test-writer) -> implementación en verde (backend-dev, frontend-dev) -> ataque (adversarial-tester) -> revisión (reviewer) -> cierre (orquestador).

## Reglas para todos los agentes

1. Lee este archivo, la spec de la funcionalidad y su tasks.md antes de actuar.
2. No amplíes el alcance más allá de la spec. Si algo falta o es ambiguo, repórtalo al orquestador en lugar de inventarlo.
3. Los implementadores (backend-dev, frontend-dev) NO crean, modifican ni borran archivos de test (*.test.ts, *.test.tsx, tests/, e2e/). Si un test parece incorrecto, lo reportan.
4. Commits con Conventional Commits y prefijo por rol: test: (test-writer y adversarial-tester), feat: o fix: (implementadores), docs: (spec-writer y orquestador), refactor: (implementadores, sin cambiar comportamiento). Un commit feat: o fix: nunca incluye archivos de test.
5. Rama por funcionalidad: feat/NNN-nombre. Solo el orquestador integra a main, con aprobación del usuario.
6. Nunca uses sequelize.sync({ force: true }) fuera de los tests. Todo cambio de esquema es una migración.
7. Nunca guardes secretos en el repositorio; usa .env (con .env.example versionado).
8. Termina cada tarea con un reporte breve: qué hiciste, archivos tocados, comandos ejecutados con su resultado y pendientes.

## Definición de terminado (por funcionalidad)

- pnpm test, pnpm lint y pnpm typecheck pasan sin errores.
- Cobertura de líneas: 90 % o más en packages/shared y en los services de apps/api; 80 % o más en el resto.
- Cada criterio de aceptación (AC-xx) de la spec tiene al menos un test cuyo nombre empieza con su ID.
- El adversarial-tester no deja hallazgos críticos ni altos abiertos.
- El reviewer emite APROBADO.
- El contrato OpenAPI coincide con lo implementado.
- docs/PROGRESS.md está actualizado.

## Comandos (los crea la Fase 0)

- (previo, manual) PostgreSQL local con polleria_dev y polleria_test creadas por el usuario
- pnpm install — instala dependencias
- pnpm dev — web y api en modo desarrollo
- pnpm test — todas las pruebas unitarias y de integración
- pnpm test:e2e — pruebas Playwright (contra polleria_test; detener pnpm dev antes, porque Next 16 no permite dos next dev en la misma carpeta)
- pnpm test:coverage — cobertura
- pnpm lint / pnpm typecheck
- pnpm db:migrate / pnpm db:seed — migraciones y datos de demostración
- pnpm printer:test — imprime una hoja de prueba con el driver configurado (PRINTER_DRIVER y PRINTER_FILE_DIR en apps/api/.env; por defecto file en tmp/comandas)
- pnpm users:create-admin — crea un administrador de forma interactiva; usar PowerShell o Símbolo del sistema para ocultar el PIN. Requiere las migraciones de usuarios aplicadas por el usuario.
