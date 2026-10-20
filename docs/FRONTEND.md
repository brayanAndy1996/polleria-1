# Trabajar en el frontend

El área de trabajo de interfaz es `frontend/`. El backend se conserva en
`backend/` y el contrato HTTP vigente en `docs/api/openapi.yaml`.

## Composición visual en Figma

La referencia estructural vigente es
`frontend/references/original-c26bfacac66444e44e4a120777feca92.webp`:
representa la toma de productos tras seleccionar una mesa. Incluye sidebar
compartida y drawer móvil ([alcance](specs/pos-sidebar/spec.md)), popup de
acciones de mesa, catálogo y pedido adaptable
([flujo POS](specs/pos-order-flow/spec.md)).

En `/mozo`, seleccionar una mesa abre sus acciones sin crear pedidos. Una
mesa libre se abre solo al confirmar y luego lleva directamente al catálogo.
Las ocupadas permiten agregar productos o ver el detalle existente. Búsqueda,
categorías horizontales con conteos y filtros trabajan sobre la carta real;
cada tarjeta abre su personalización antes de agregar a la tanda.
Desde 1024px el pedido sin enviar aparece a la derecha. En móvil, «Ver pedido»
muestra unidades y total; abre un panel inferior desplazable hasta el envío.
Cerrar o redimensionar conserva esa tanda en memoria; recargar o abandonar
la página no es un mecanismo de guardado. No confundirla con toda la cuenta.

La [propuesta POS v1](https://www.figma.com/design/Hkuwm8zQT2kNj1SSSyWJwO/?node-id=40-56)
se implementó tras la aprobación inicial, pero el usuario rechazó el resultado
visual y cambió de referencia. Se conserva como historial, no como aprobación
vigente de la navegación. Las integraciones de Next steps siguen fuera del
rediseño; no implementar cobros/reservas/delivery por aparecer en una imagen.

La [UI actual editable](https://www.figma.com/design/Hkuwm8zQT2kNj1SSSyWJwO?node-id=28-2)
se exportó el 2026-10-16: 23 pantallas y estados, incluidas tres vistas móviles
de 390 px, organizados en acceso, salón/pedidos, administración y caja/cocina.
Contiene texto Nunito, formas, imágenes de contenido y contenedores editables;
no es un prototipo funcional ni una biblioteca de componentes completa.

Figma sirve para ajustar guías gráficas y composición. Para traer cambios,
comparte el enlace del frame terminado y se implementará en `frontend/`,
conservando contratos, permisos y lógica del sistema en el repositorio.
No hay sincronización automática de ida y vuelta ni conexión de Figma a la DB.

Las vistas marcadas como ejemplo usan datos ilustrativos preparados solo en
un navegador aislado; no se abrieron mesas ni registraron pedidos en la base.
Caja y Cocina reflejan el alcance actual, sin presentar funciones pendientes
como implementadas. El selector de usuarios se capturó a 780 px; las demás
vistas no móviles, a 1440 px.

## Entorno listo en esta copia WSL

El 2026-10-16 se autorizó preparar PostgreSQL 17 local, su conexión y los datos
de demostración. Desde la raíz usa:

```sh
npm run dev
```

Ese comando inicia PostgreSQL si está apagado y luego frontend/backend.
Abre `http://localhost:3000/login`. Usuarios de desarrollo: `Demo Administrador`
con PIN `135790`, o `Demo Mozo` con PIN `2468`. Son cuentas de demostración,
no credenciales para producción. La [guía de demo](PROBAR-DEMO.md) detalla las
otras áreas y el alcance disponible.

La configuración y los datos locales no se suben a Git. En otra máquina debes
preparar la conexión una vez. Ver [infraestructura local](../infra/README.md).

## Primer arranque

Desde la raíz del repositorio, con Node 24 y pnpm 10.12.1:

```sh
pnpm install --frozen-lockfile
pnpm dev:frontend
```

Abre `http://localhost:3000`. Para navegar por pantallas autenticadas y operar
con datos reales necesitas que la API esté disponible. Si otra persona ya la
ejecuta, no debes arrancar otra copia ni modificar sus datos.

Si la API ya está preparada en esta misma PC, se puede iniciar en otra terminal
con `pnpm dev:backend`. `pnpm dev` inicia ambas aplicaciones. PostgreSQL y las
migraciones deben estar preparados por la persona responsable del backend;
arrancar frontend no ejecuta migraciones ni seeds.

También puedes usar `npm run dev` desde la raíz: prepara el PostgreSQL local
opcional descrito arriba y ejecuta el arranque conjunto mediante pnpm.
Necesitas pnpm instalado y configurado según el `packageManager` del proyecto.

### Si el backend indica que falta `.env`

El backend necesita `backend/.env`, basado en `backend/.env.example`, con la
conexión real a PostgreSQL. El texto `cambia_esta_clave` de la plantilla es un
marcador que debes reemplazar localmente; no es una credencial funcional.
No compartas el archivo ni lo subas a Git.

En Node 24.13.0 se observó que el arranque con `--watch` termina con `ENOENT`
al intentar vigilar ese `.env` ausente y después puede mostrar `EPIPE`.
Preparar el archivo resuelve su ausencia, pero aún debes iniciar PostgreSQL y
configurar una base válida. La preparación de tablas y usuarios corresponde
a la [guía de demo](PROBAR-DEMO.md), con el responsable del backend.

## Dónde editar

Para organizar estilos nuevos y continuar la extracción incremental, consulta
la [guía de CSS Modules de Pollería](../frontend/docs/styles.md). El primer
bloque es el tablero de Mesas; no se reemplazan Tailwind ni HeroUI.

| Necesidad | Ubicación |
| --- | --- |
| Acceso y selección de área | `frontend/src/app/login/`, `frontend/src/app/areas/`, `frontend/src/components/auth/` |
| Mesas y pedidos del mozo | `frontend/src/app/mozo/` |
| Caja y cocina | `frontend/src/app/caja/`, `frontend/src/app/cocina/` |
| Administración | `frontend/src/app/admin/` |
| Componentes reutilizables | `frontend/src/components/` |
| Estilos globales | `frontend/src/app/globals.css` |
| Layout y proveedores | `frontend/src/app/layout.tsx`, `frontend/src/app/providers.tsx` |
| Cliente HTTP y operaciones de API | `frontend/src/lib/api/` |
| Imágenes publicadas | `frontend/public/` |
| Pruebas de interfaz y mocks | Tests junto a componentes y `frontend/tests/` |

## Conectar con una API existente

El navegador solicita `/api/*` al mismo origen que la web. Next.js reenvía esas
solicitudes a `API_INTERNAL_URL`, cuyo valor por defecto es
`http://127.0.0.1:4000`. Para usar otra API accesible desde el servidor Next,
configura `API_INTERNAL_URL` en `frontend/.env.local`, sin credenciales en la
URL y sin versionar el archivo. Consulta `frontend/.env.example`.

La configuración es del servidor; no se necesita una variable `NEXT_PUBLIC_`
ni se debe cambiar el cliente para que los celulares llamen directamente a la
API. Reinicia desarrollo tras cambiarla; para producción debe estar definida
al ejecutar el build.

El frontend conserva sus comprobaciones de formulario y valida respuestas con
los esquemas de `@polleria/shared`. La autorización, los precios definitivos y
las transacciones siguen siendo responsabilidad del backend.

## Verificar cambios de interfaz

Desde la raíz:

```sh
pnpm test:frontend
pnpm typecheck:frontend
pnpm build:frontend
pnpm lint
```

Las pruebas de interfaz usan MSW y no necesitan PostgreSQL. Los mocks son
exclusivos de pruebas: no habilitan una demo autenticada en producción.

Las pruebas completas y E2E pueden usar `polleria_test`: deben coordinarse con
la persona responsable, ejecutarse en serie y conservar las guardias de base
aislada. No uses `db:demo`, migraciones o seeds como parte de un cambio visual.

## Límite de cambios

Para trabajo visual, mantén las modificaciones en `frontend/`. Si falta un
endpoint o necesitas cambiar un campo, informa la necesidad y coordina el
contrato antes de modificar `backend/` o `packages/shared/`. Las pantallas de
caja y cocina conservan el alcance funcional existente; cambiar su apariencia
no implementa pagos, inventario ni impresión física.
