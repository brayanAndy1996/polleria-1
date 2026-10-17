# Pollería

Monorepo pnpm con frontend Next.js, API Express y contratos compartidos.

En esta copia local el entorno de desarrollo ya está preparado. Desde la raíz:

```sh
npm run dev
```

Abre `http://localhost:3000/login`. Usuario `Demo Administrador`, PIN `135790`;
usuario `Demo Mozo`, PIN `2468`. Son datos exclusivos de demostración.
La conexión y las rutas de PostgreSQL son locales y no se versionan.

- [Guía para trabajar en frontend](docs/FRONTEND.md)
- [Documentación del proyecto](docs/)
- [Frontend](frontend/)
- [Backend](backend/)
- [Paquete compartido](packages/shared/)
- [Pruebas E2E](e2e/)
- [Scripts de desarrollo](scripts/)
- [Infraestructura](infra/)

Comandos principales: `pnpm dev:frontend`, `pnpm dev:backend`,
`pnpm build:frontend`, `pnpm test:frontend` y `pnpm typecheck:frontend`.
