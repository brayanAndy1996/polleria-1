# Metodología y modelos en Codex

Política reducida aprobada por el usuario el 2026-10-12 tras alcanzar el límite de uso. Sustituye la asignación anterior de siete roles para trabajo nuevo, incluida la spec 013 en curso. Conserva los resultados y las pruebas producidos por el equipo anterior. Actualización del usuario del 2026-10-16: «usa el gpt 6.1 sol low para reemplazar a luna»; se aplica a test-writer y trabajo sencillo.

| Función                                  | Ejecutor         | Modelo / razonamiento                                                          |
| ---------------------------------------- | ---------------- | ------------------------------------------------------------------------------ |
| Orquestación, specs, OpenAPI y revisión  | Agente principal | Modelo de la sesión; sin subagentes adicionales                                |
| test-writer                              | Un subagente     | gpt-6.1-sol / low                                                              |
| implementer (backend, frontend y shared) | Un subagente     | gpt-6.1-sol / low en tareas sencillas; gpt-6.1-sol / medium en lógica compleja |

Luna fue la elección inicial para test-writer; el usuario la reemplazó por gpt-6.1-sol low al agotarse su cuota. Los bloques complejos de implementación reservan gpt-6.1-sol. Explicar el modelo al delegar; si su cuota impide trabajar, informar y continuar tareas independientes, sin sustitución silenciosa ni bucles de reintentos. Cambiar a medium reduce consumo futuro, pero no repone cuota agotada. No se promete un ahorro exacto.

## Flujo vigente

1. El principal prepara spec/tareas/contrato y obtiene aprobación del comportamiento nuevo. Mantiene los 14 AC y P-01…P-06 ya aprobados de la 013.
2. test-writer escribe o repara las pruebas de un bloque pequeño y demuestra rojo causal, distinguiendo módulos ausentes, bugs y fallos de fixtures/entorno.
3. implementer escribe producción mínima y refactoriza hasta verde. No puede crear, modificar ni borrar tests.
4. El principal revisa diff, trazabilidad y resultados. Las discrepancias de tests vuelven al test-writer. Si cambia comportamiento aprobado, consulta al usuario.
5. Verificaciones dirigidas por bloque; suite completa, tipos, lint, cobertura y E2E pertinentes al cierre. Ningún resultado omitido/esperado se cuenta como aprobado.
6. El principal mantiene PROGRESS/CONTINUAR y solicita autorización para integrar a main. Mantener commits de tests, producción y docs separados.

Se eliminan los subagentes separados spec-writer/reviewer y la ronda adversarial independiente. Las pruebas adversariales existentes permanecen en la suite; test-writer mantiene regresiones críticas de dinero, permisos, idempotencia y concurrencia. La revisión principal no tiene la independencia del reviewer anterior: registrar esta limitación. No ampliar ni reducir criterios de aceptación para ahorrar cuota.

## Delegación y ejecución

Solo un test-writer y un implementer activos; usar collaboration.spawn_agent con fork_turns="none", model explícito y reasoning_effort="low" para test-writer/trabajo sencillo o "medium" para implementación compleja. Pasar únicamente rol, spec/AC/tareas del bloque, contrato pertinente, archivos asignados, decisiones y evidencia de rojo disponible. No heredar todo el historial ni crear subagentes secundarios.

No superponer tests de DB, cobertura y E2E sobre polleria_test. Coordinar el dueño del slot de DB. No instalaciones simultáneas ni escrituras sobre los mismos archivos. El entorno de nube ya está aislado: no crear worktrees salvo solicitud.

## Traspaso de la 013

Spec aprobada; OpenAPI 0.10.0 tiene tres operaciones pendientes. AC-01/02 implementados y revalidados por el equipo anterior: 61 unitarios nuevos verdes, 183 unitarios previos verdes y 45 adversariales verdes con un fallo esperado intacto. Commits ca31064, 99c3a75, 124f1ee, 2985b45 conservan esa historia.

El límite de uso interrumpió T-03…T-08 y T-11…T-13. Hay pruebas y producción parciales sin commit: preservarlas, validar fixtures y retomar por bloques, sin presumir verde. E2E baseline home/auth mobile 8/8 pasó con Chromium del sistema 154.0.8037.57 y configuración local externa; los E2E nuevos de 013 todavía no se validaron.
