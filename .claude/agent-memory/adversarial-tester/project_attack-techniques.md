---
name: project-attack-techniques
description: Técnicas de ataque reutilizables en este proyecto (texto Unicode, zod, rutas de Windows, Intl) y trampas del entorno de trabajo
metadata:
  type: project
---

Técnicas que funcionaron en la 002 y sirven para specs futuras (observaciones de comandas, filtros de reportes, configuración):

- DoS por normalización Unicode: ICU reordena marcas combinantes con inserción (cuadrático). Peor caso por línea de 2000 unidades: `'̈́'.repeat(1000) + '̣'.repeat(999)` (U+0344 se descompone en dos marcas de clase 230; U+0323 es clase 220). Aplica a cualquier `normalize('NFC'|'NFD')` sobre texto de usuario.
- Probar que zod no corta temprano: pasar un `Proxy` de arreglo que cuente lecturas de índices; zod 4 aplica `.max()` de arrays después de recorrer todos los elementos.
- Windows: `path.resolve(root, 'Q:rel')` usa `process.env['=Q:']` o `process.cwd()`; se demuestra con `vi.spyOn(process, 'cwd')` y `vi.stubEnv('=Q:', undefined)`.
- `Intl.DateTimeFormat('en-US', { year: 'numeric' })` da años de era (1 a. C. = 1), no ISO.
- Mock de node:fs/promises en un archivo de test propio (vi.hoisted + vi.mock) para simular fallas con el FileHandle abierto.

Trampas del entorno:
- No agregar dependencias (ni fast-check) en una rama de spec: las specs piden que pnpm-lock.yaml no cambie (R-002-04). Usar generadores con semilla (mulberry32 en apps/api/tests/helpers/seeded-random.ts).
- En el Bash de este equipo, los heredoc con `'EOF'` pierden barras invertidas en scripts: escribir los scripts de sondeo con la herramienta Write.
- Deuda conocida en Vitest 5.0.3: `it.fails`, `it.fails.each` e `it.runIf(cond).fails` funcionan. Prettier no le da a `it.fails('título largo', fn)` la excepción de formato de `it(...)` y reindenta el cuerpo, así que hay que correr `prettier --write` solo en esos archivos. `it.fails` se traga el mensaje de error: para probar que un test de tiempo falla por tiempo, usa la duración del reporter verbose.

**Why:** ahorra tiempo de exploración y evita romper requisitos de la spec al atacar.
**How to apply:** úsalo al planear ataques sobre texto libre, validaciones zod, rutas configurables o fechas. Relacionado: [[project-adversarial-findings-002]].
