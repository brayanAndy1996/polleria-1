# Instrucciones para Codex

Lee CLAUDE.md, docs/PROGRESS.md y docs/CONTINUAR.md al iniciar. La metodología reducida aprobada el 2026-10-12 en docs/agents/modelos-codex.md prevalece sobre perfiles históricos de Claude/Devin y el flujo anterior de siete roles.

Tres funciones: orquestador principal, test-writer y un implementer que cubre backend/frontend/shared. El principal redacta specs, mantiene OpenAPI/documentación, revisa y verifica; no escribe producción ni tests. Solo los dos roles ejecutores usan subagentes. No crear agentes separados spec-writer, reviewer o adversarial-tester, ni duplicar un rol en paralelo.

Usa fork_turns="none", contexto acotado y reasoning_effort="medium". Test-writer usa gpt-6-luna. Implementer usa gpt-6-luna para tareas sencillas y gpt-6.1-sol para lógica compleja de transacciones, permisos, dinero o concurrencia. Explica el modelo elegido; no usar xhigh/max por defecto. Si la cuota impide el modelo necesario, informa el bloqueo y continúa tareas independientes; no reintentes en bucle.

Flujo: spec aprobada → bloque pequeño de pruebas en rojo → implementación mínima en verde → revisión del principal → checks de cierre. Conserva todos los AC aprobados y las pruebas adversariales existentes como regresiones. El test-writer conserva casos críticos de dinero/permisos/idempotencia/concurrencia; el implementer no cambia tests. No hay ronda adversarial independiente ni revisión independiente: registrar esa limitación sin atribuir verificaciones ficticias.

Serializa Vitest/cobertura/Playwright si usan polleria_test; evita instalaciones simultáneas y escrituras en los mismos archivos. Tests solo con guardias de DB aislada. Commits separados de tests, producción y docs. Integración a main requiere autorización posterior del usuario.

Usa el checkout existente de la nube; no crees worktrees salvo solicitud explícita. Durante planificación no implementes. Preserva el trabajo parcial previo y retoma desde evidencia real, sin reconstruir TDD retrospectivo.

Skill instalada por solicitud del usuario: design-taste-frontend en .agents/skills/design-taste-frontend/ (origen y hash en skills-lock.json). Leer su SKILL.md antes de aplicarla. Su versión instalada está orientada a páginas públicas/landing pages y excluye dashboards y pantallas de apps; no imponer sus reglas al POS ni sustituir los requisitos, permisos o metodología del proyecto.
Para diseño/revisión de interfaz, el usuario instaló frontend-design, web-design-guidelines y ui-ux-pro-max en .agents/skills/. Leer sus SKILL.md y aplicarlos en cambios UI. Su guía visual no sustituye permisos, metodología reducida, contratos ni reglas de dominio de este proyecto.
