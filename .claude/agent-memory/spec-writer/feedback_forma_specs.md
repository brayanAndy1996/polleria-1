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

**Why:** el test-writer y los implementadores no ven la conversación; una spec ambigua genera tests mal dirigidos o implementaciones que no coinciden.
**How to apply:** repetir esta estructura en cada spec nueva; ver [[decisiones-modelado]].
