# Agentes

Cada subpestaña contiene un archivo listo para copiar en `.claude/agents/` con el nombre indicado. Copia todo el bloque de código, incluida la cabecera entre las líneas `---`: Claude Code ignora el archivo si la primera línea no es `---`.

| Archivo | Rol |
| --- | --- |
| `orquestador.md` | Sesión principal: coordina y reporta |
| `spec-writer.md` | Specs, tareas y contrato OpenAPI |
| `test-writer.md` | Tests en rojo antes del código |
| `backend-dev.md` | Implementación de la API |
| `frontend-dev.md` | Implementación de la interfaz |
| `adversarial-tester.md` | Ataque y casos borde |
| `reviewer.md` | Revisión y aprobación |
