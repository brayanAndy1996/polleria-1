---
name: entorno-verificado
description: Restricciones de versiones y comportamientos verificados el 2026-10-07 (Node 24.1.0, TS 6.0.3, jsdom 29, Next 16 dev origins y lockfile, Chrome 111) que condicionan dependencias y specs futuras
metadata:
  type: project
---

Hechos verificados el 2026-10-07 (registro npm y pruebas locales), recogidos en docs/decisions/0001-stack-y-versiones.md (Propuesto):

- Node 24.1.0: type stripping funciona con ExperimentalWarning (ocultar con --disable-warning=ExperimentalWarning); enum rompe; --env-file-if-exists da prioridad al entorno; process.loadEnvFile no sobrescribe; importar paquete workspace pnpm que exporta .ts funciona.
- TypeScript fijado en 6.0.3 porque typescript-eslint 8.71.1 exige <6.1.0 (latest TS es 7.0.2).
- jsdom 30.x exige Node >=24.15 -> se fijó jsdom 29.1.1 mientras siga Node 24.1.0 (pregunta abierta: actualizar Node).
- openapi-typescript 7.13.0 tiene peer typescript ^5.x -> conflicto con TS 6; diferido, decidir en la spec que lo instale.
- pg-hstore no hace falta: Sequelize 6.37.8 lo carga solo al usar HSTORE.
- Next 16.4.0: browserslist Chrome/Edge/Firefox 111, Safari 16.4; en dev bloquea /_next desde orígenes no localhost (allowedDevOrigins, variable WEB_ALLOWED_DEV_ORIGINS); no permite dos next dev en la misma carpeta (lockfile); tsconfig con jsx react-jsx; existe next typegen.
- HeroUI 3.2.6 peers: react-aria-components, react-aria, @react-aria/ssr, @react-aria/utils, @internationalized/date, tailwindcss>=4. Estilos en paquete @heroui/styles.
- Android 9 llega hasta Chrome 138 (anuncio de Google, a confirmar); piso del stack Chrome 111.
- zod 4.6.5: `z.string().max(n)` / `.min(n)` cuentan puntos de código, NO unidades UTF-16 (max(2000) acepta 1001 emojis = 2002 de .length). Si una spec fija un largo con .length, debe decir que se compare line.length explícitamente (refine). Aplica a futuros límites de texto (observaciones de ítems, nombres de productos). `z.string().trim()` usa String.prototype.trim (quita también tabs y U+00A0).
- Node `util.parseEnv` / `--env-file`: recorta los valores sin comillas; con comillas conserva los espacios.

**Why:** estas restricciones no se ven en el código y explican por qué se eligieron ciertas versiones.
**How to apply:** antes de proponer una dependencia o subir una versión, revisar peers y engines contra esto (npm view funciona desde este entorno). Ver [[decisiones-modelado]] y [[herramientas-entorno]].
