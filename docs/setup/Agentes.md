# Agentes

En Codex, el flujo vigente usa principal + test-writer + implementer; no ejecutar los siete perfiles históricos de la tabla de abajo. Ver docs/agents/modelos-codex.md y AGENTS.md.

Para Codex, las definiciones vigentes están en `docs/agents/` y la asignación aprobada de modelos y razonamiento en `docs/agents/modelos-codex.md`. El orquestador debe pasar esos parámetros al crear cada subagente; los archivos Markdown no seleccionan el modelo automáticamente.

Los perfiles históricos de Claude Code permanecen en `.claude/agents/`. No copies las cabeceras con modelos GPT a esa plataforma: sus nombres de modelo y capacidades son distintos.

| Archivo | Rol |
| --- | --- |
| `orquestador.md` | Sesión principal: coordina y reporta |
| `spec-writer.md` | Specs, tareas y contrato OpenAPI |
| `test-writer.md` | Tests en rojo antes del código |
| `backend-dev.md` | Implementación de la API |
| `frontend-dev.md` | Implementación de la interfaz |
| `adversarial-tester.md` | Ataque y casos borde |
| `reviewer.md` | Revisión y aprobación |
