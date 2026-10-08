---
description: Orquestación obligatoria del Sistema Pollería con subagentes, SDD, TDD y pruebas adversariales.
trigger: always_on
---

# Orquestación del proyecto

- El agente principal actúa como orquestador según `docs/agents/orquestador.md`: planifica, delega, verifica y mantiene el estado. No escribe código de producción ni pruebas.
- Lee `CLAUDE.md`, `docs/PROGRESS.md`, la spec y su `tasks.md` antes de cada encargo. Las definiciones de roles viven en `docs/agents/`; los perfiles de Devin en `.devin/agents/` las referencian sin duplicarlas.
- Por funcionalidad: `spec-writer` → aprobación explícita del usuario → `test-writer` (rojo comprobado) → `backend-dev` y `frontend-dev` (verde) → `adversarial-tester` → `reviewer` → verificación del orquestador → cierre documental → permiso para integrar a `main`.
- Usa subagentes reales y separados. Si los perfiles personalizados no aparecen en la sesión, usa los perfiles nativos disponibles pasando al subagente la definición de su rol, la spec, las tareas, los AC, la rama, las decisiones y las restricciones. No presentes esa ejecución como un perfil personalizado cargado.
- Los implementadores no crean, modifican ni eliminan tests. Solo `test-writer` y `adversarial-tester` pueden escribir pruebas en su alcance. El reviewer es independiente y no modifica archivos.
- Ante un hueco o un hallazgo: el dueño de los tests escribe primero una regresión y comprueba el rojo; después el implementador asignado corrige producción, sin cambiar la prueba. No debilitar aserciones, omitir pruebas ni marcar fallas esperadas sin autorización.
- No afirmar que un trabajo previo fue delegado, ni reconstruir retrospectivamente un TDD ficticio. Documentar las desviaciones y auditar el trabajo existente antes de cerrarlo.
- Pruebas únicamente con mocks o una base aislada validada. Prohibido usar la base principal, crear o eliminar bases o roles, exponer secretos o ejecutar migraciones/seeds de desarrollo sin autorización. Toda limpieza requiere verificar la conexión y autorización específica para las tablas afectadas.
- Serializa todas las suites que usen la misma base de pruebas, incluidas Vitest, cobertura y Playwright. Ningún subagente las ejecuta mientras otro proceso pueda estar usando esa base. Tampoco ejecutar instalaciones simultáneas ni permitir escrituras de dos agentes en los mismos archivos.
- No cerrar con hallazgos críticos/altos abiertos o sin `APROBADO` del reviewer. Cumplir la definición de terminado de `CLAUDE.md`, registrar pendientes manuales y actualizar `docs/PROGRESS.md` y `docs/CONTINUAR.md`. El orquestador confirma personalmente los resultados; no inventar métricas.
- Ningún subagente hace commits, merges, cambios de rama o pushes sin un encargo específico. Mantener separados tests, producción y documentación cuando se autoricen commits.
- Las decisiones técnicas específicas de la spec y los ADR aprobados prevalecen sobre instrucciones genéricas antiguas de los roles. Si existe una contradicción real sin decisión aprobada, informar al orquestador; no cambiar el alcance ni instalar dependencias para resolverla por cuenta propia.
