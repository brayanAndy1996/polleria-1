---
name: herramientas-entorno
description: Herramientas útiles y trampas del entorno Windows del proyecto para verificar specs (npm view, Redocly via npx, python que se cuelga)
metadata:
  type: reference
---

- `npm view <paquete>@<versión> peerDependencies engines --json` funciona desde este entorno (hay acceso al registro npm): úsalo para verificar versiones antes de proponerlas.
- Validar el contrato: `npx -y @redocly/cli@latest lint docs/api/openapi.yaml` ejecutado desde el scratchpad (no agrega dependencias al proyecto). En la 001 dio "valid" con advertencias aceptables (sin licencia, servidor localhost, componentes reutilizables sin uso).
- Para revisar el comportamiento real de un paquete, `npm pack <paquete>@<versión>` en el scratchpad y grep en el código (así se verificó Next 16.4.0 y Sequelize).
- En este Windows, `python` se queda colgado (alias); no usarlo. Para ediciones masivas de Markdown, escribir un script .cjs en el scratchpad y ejecutarlo con node, en vez de node -e con regex escapadas en bash (un reemplazo así rompió una sección de la spec 001 y hubo que restaurarla).

Ver [[entorno-verificado]].
