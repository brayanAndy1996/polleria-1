---
name: validar-rojo-con-copia-desechable
description: Receta para comprobar que las pruebas en rojo son aprobables sin escribir código de producción en el repo
metadata:
  type: feedback
---

Antes de reportar la fase roja, validar que cada prueba puede pasar con una implementación razonable, usando una copia fuera del repo.

**Why:** los implementadores no pueden modificar las pruebas; una prueba mal escrita (opción de librería inexistente, fake timers, rutas) los bloquea. En la spec 001 esta validación encontró `onUnhandledRequest` (MSW 3) y el problema de `new URL(..., import.meta.url)` en jsdom antes de entregar.

**How to apply:**
1. Copiar el árbol al scratchpad: `git ls-files -co --exclude-standard | grep -v '^docs/' | tar -cf - -T - | tar -xf - -C <scratch>/copy`, luego `pnpm install --offline --frozen-lockfile` allí (unos 40 s).
2. Escribir en la copia (nunca en el repo) una implementación mínima de los módulos de la sección 11 de la spec y correr `vitest`, `eslint`, `tsc` y `playwright` allí.
3. Para E2E sin base real, la copia puede usar una variable de entorno que fuerce la salud en ok; el repo real nunca.
4. Resincronizar solo los tests a la copia con `git ls-files -co ... | grep -E '\.test\.|tests/|e2e/|vitest.config.ts' | tar ...`.
4b. Además de comprobar que pasan, aplicar mutaciones a la implementación desechable (un script .mjs que reemplaza un texto, corre `node_modules/vitest/vitest.mjs run <archivo>` y restaura): sin reintentos, sin limpieza del temporal, hora UTC, sin NFC, etc. En la spec 002, 17 mutaciones fueron detectadas; sirve para demostrar que las pruebas tienen dientes. La implementación desechable también destapó dos problemas de la spec (AC-13 contra D-002-04 y el conteo de Zod 4) que no se ven solo leyendo.
5. Lo que depende de PostgreSQL real (AC-12, AC-21 a AC-24, AC-09) no se puede validar sin `backend/.env`; revisarlo a mano y reportarlo como no ejecutado contra PG.
