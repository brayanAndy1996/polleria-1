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
- Nunca pasar Markdown con comillas invertidas por bash (comillas dobles o heredoc): bash ejecutó `pnpm dev` dentro de un texto y dejó un error de pnpm en la spec 001 (corregido en la enmienda 1); además, un heredoc largo con comillas simples falló con "unexpected EOF". Para anexar texto largo: Write a un archivo del scratchpad y luego `cat archivo >> destino`.
- Fin de línea: la 001 tenía CRLF en la copia de trabajo, pero docs/specs/002-printer-service/*.md tienen LF (verificado 2026-10-07). No asumir: revisar con `od -c` o un script; el Edit tool respeta lo que haya.
- Para ver el comportamiento ACTUAL de la API sin tocar el proyecto: script .mjs en el scratchpad que importa backend/src/*.ts por file URL (pathToFileURL) y se ejecuta con `node --disable-warning=ExperimentalWarning` con cwd en backend (resuelve express, sequelize, zod). Para leer código de dependencias instaladas: node_modules/.pnpm/<paquete>@<versión>/node_modules/<paquete>.

- Las herramientas Write/Edit a veces convierten escapes `\uXXXX` del texto en el carácter real (visto con U+2028, U+2029 y U+200B, no siempre; en la 003 convirtió TODOS los `\uXXXX` de 4 cifras, también U+00A0, U+0301, U+0661 y U+FF11, pero no `\u{1F357}` ni `\t`/`\n`). Reponerlos con un script .cjs en el scratchpad que recorra una lista de code points y reemplace cada carácter por `String.fromCharCode(92) + 'u' + hex4`; revisar también tasks.md. Después de escribir una spec o un script con escapes de caracteres invisibles, escanear el archivo con un script .cjs (buscar \p{Cc}, \p{Cf}, \p{Zl}, \p{Zp}, Zs distintos del espacio) y reponer el escape con `String.fromCharCode(92) + 'u200B'`.
- Para fijar valores esperados de una función nueva (por ejemplo la normalización de la 002), escribir un prototipo .mjs en el scratchpad y un script con node:assert que compruebe cada ejemplo de la spec antes de commitear.

Ver [[entorno-verificado]].
