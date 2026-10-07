---
name: web-tooling-gotchas
description: Efectos secundarios no obvios de next dev, HeroUI v3 y Playwright en este monorepo (Windows, pnpm)
metadata:
  type: project
---

- `next dev` (Next 16.4.0) crea `apps/web/AGENTS.md` solo cuando detecta un agente de IA (por ejemplo al correr `pnpm dev` o `pnpm test:e2e` desde un agente). Se apaga con `agentRules: false` en next.config.ts. En la spec 001 T-04 se dejó next.config.ts mínimo por orden del orquestador, así que se borra el archivo a mano y se reportó la opción.
  **Why:** ensucia `git status` en cada corrida de E2E. **How to apply:** antes de commitear tras correr `next dev`, revisar `git status` y no incluir AGENTS.md; si T-23 toca next.config.ts, proponer `agentRules: false`.
- HeroUI v3: globals.css es `@import 'tailwindcss'; @import '@heroui/styles';`. El index.css de @heroui/styles ya importa tailwindcss, y el import doble no duplica CSS (430558 vs 430317 bytes). No hay Provider. Su `--font-sans` ya es una pila de fuentes del sistema (sin recursos externos).
- pnpm 10.12.1 en este repo: `pnpm ignored-builds` da "None" con Next/HeroUI/Tailwind 4/Playwright; no hace falta onlyBuiltDependencies.
- Playwright no define NODE_ENV en sus procesos; en el webServer de la web se fija NODE_ENV=development por seguridad. Los webServer funcionan en Windows con `node ...` y `pnpm exec next dev --port 3100` (cwd apps/web) y liberan los puertos al terminar.
- Para probar playwright.config.ts sin API real: carpeta temporal `tmp/` en la raíz (ignorada por git/eslint/prettier) con un config que importe el real y un stub de la API; borrarla al terminar.
