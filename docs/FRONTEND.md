# Trabajar en el frontend

El área de trabajo de interfaz es `frontend/`. El backend se conserva en
`backend/` y el contrato HTTP vigente en `docs/api/openapi.yaml`.

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

## Dónde editar

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
