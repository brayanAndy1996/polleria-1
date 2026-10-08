---
name: forma-de-las-specs
description: Cómo quiere el orquestador que se estructuren las specs (AC solo comportamientos testeables, requisitos de configuración aparte, dependencias de soporte, contrato interno de módulos)
metadata:
  type: feedback
---

El orquestador pidió (spec 001, 2026-10-07) esta forma para las specs:
- Los AC-xx son solo comportamientos verificables por un test automatizado (la definición de terminado exige un test cuyo nombre empiece con el ID). Lint, typecheck, Prettier, scripts, versiones fijas y umbrales de cobertura van en una sección "Requisitos de configuración (verificados por comando)" con comando y resultado esperado.
- Sección "Dependencias de soporte que requieren aprobación": todo paquete fuera de la lista de CLAUDE.md, con versión y una línea de justificación; minimizar prefiriendo capacidades nativas. El ADR debe repetir la lista.
- Documentar decisiones técnicas no obvias (comunicación web-API, puertos, base de los E2E y cómo se levantan) y marcar como SUPUESTO + pregunta abierta lo no confirmado.
- En tasks.md de la fase base: primero andamiaje solo de configuración (backend-dev y frontend-dev), luego test-writer, luego implementación.

Lo que funcionó en la 001: incluir una sección "Contrato interno de módulos" con rutas y firmas exactas que importan las pruebas, y mensajes de error exactos en los AC, para que test-writer e implementadores no tengan que inventar.

Enmiendas por hallazgos adversariales (patrón pedido por el orquestador en la enmienda 1 de la 001, 2026-10-07):
- La spec sigue Aprobada; se anota en la cabecera "Enmienda N aprobada por el usuario el <fecha> (...)" y se agrega una sección final "N. Enmienda N (<fecha>): ..." con decisiones D-xx nuevas, AC que continúan la numeración, casos borde, supuestos y preguntas. Las secciones afectadas (9.2, 11, 7, 14...) llevan una nota corta que remite a la enmienda.
- tasks.md continúa la numeración de tareas: primero test-writer, luego backend-dev y frontend-dev (en paralelo), con matriz AC/tarea/hallazgo y la verificación de cierre.
- Los tests adversariales existentes son restricciones duras: leerlos completos y redactar AC compatibles; nadie los modifica. Antes de fijar códigos o valores, reproducir el comportamiento actual con un script en el scratchpad (ver [[herramientas-entorno]]).
- Si una regla se puede implementar de varias formas, el AC debe aceptar cualquier forma correcta y rechazar solo la incorrecta (ejemplo: AC-37 prohíbe clasificar por status sin forzar un mecanismo).

Aclaraciones por hallazgos del test-writer (patrón pedido por el orquestador en la 002, 2026-10-07): cuando una spec Aprobada tiene una contradicción o un hueco que no cambia nada visible para el dueño, se corrige en el lugar (D-xx, casos borde, nota en tasks.md), sin tocar AC ni tests, con una línea en la cabecera "Aclaración N (<fecha>): ..." y una sección final con tabla (problema, aclaración, dónde). Los huecos sin AC se resuelven como SUPUESTO + caso borde, no con AC nuevos. Antes de escribir, verificar las afirmaciones (comportamiento de librerías, salida del corte) con un script en el scratchpad.

Numeración entre specs (propuesta en la 002, 2026-10-07, aún sin validar por el usuario): el orquestador pide AC-01, AC-02... por spec, así que los AC se repiten entre specs. Para distinguirlos, las pruebas de cada spec van en archivos nuevos con un describe que empieza con el número de spec ('002:'). Los demás IDs llevan el número de spec: HU-002-01, D-002-01, S-002-01, R-002-01, RN-002-01. Si una spec cambia AC aprobados de otra, se agrega una sección "Cambios a la spec NNN" con tabla (elemento, cambio, quién) y notas cortas en la spec anterior.

**Why:** el test-writer y los implementadores no ven la conversación; una spec ambigua genera tests mal dirigidos o implementaciones que no coinciden.
**How to apply:** repetir esta estructura en cada spec nueva; ver [[decisiones-modelado]].
