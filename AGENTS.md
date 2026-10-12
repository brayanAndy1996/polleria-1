# Instrucciones para Codex

Lee `CLAUDE.md`, `docs/PROGRESS.md` y `docs/CONTINUAR.md` al iniciar trabajo en este repositorio. Las decisiones aprobadas más recientes prevalecen sobre instrucciones históricas de plataforma.

El agente principal es el orquestador según `docs/agents/orquestador.md`. Planifica, delega, verifica y mantiene documentación; no escribe código de producción ni tests. Usa subagentes reales y separados para cada rol del ciclo SDD → TDD → pruebas adversariales → revisión.

La asignación aprobada de modelos está en `docs/agents/modelos-codex.md`. Al crear cada subagente, usa `fork_turns="none"` y pasa explícitamente:

- spec-writer: `model="gpt-6.1-sol"`, `reasoning_effort="xhigh"`.
- test-writer, backend-dev, frontend-dev y reviewer: `model="gpt-6.1-sol"`, `reasoning_effort="medium"`.
- adversarial-tester: `model="gpt-6-luna"`, `reasoning_effort="max"`.

Incluye en cada encargo la definición del rol, spec/tasks, AC, decisiones aprobadas, rama y alcance de archivos. No cambies estos modelos silenciosamente. El reviewer no edita archivos; los implementadores no editan tests. Serializa las suites que comparten polleria_test y evita escrituras concurrentes en los mismos archivos. No integres a main sin autorización del usuario.

Cada tarea de nube ya está aislada: usa el checkout existente y no crees worktrees salvo solicitud explícita. Durante planificación no implementes ni lances tareas de producción o tests.
