# Modelos y delegación en Codex

Asignación aprobada por el usuario el 2026-10-12. Esta tabla y los campos `model` y `reasoning_effort` de los seis roles prevalecen, para Codex, sobre las asignaciones históricas Opus/Sonnet de otras plataformas.

| Rol | Identificador del modelo | Razonamiento |
| --- | --- | --- |
| spec-writer | gpt-6.1-sol | xhigh |
| test-writer | gpt-6.1-sol | medium |
| backend-dev | gpt-6.1-sol | medium |
| frontend-dev | gpt-6.1-sol | medium |
| adversarial-tester | gpt-6-luna | max |
| reviewer | gpt-6.1-sol | medium |

GPT-6 Luna corresponde al identificador `gpt-6-luna`. No se cambia el modelo del agente principal: actúa como orquestador y no escribe producción ni pruebas.

## Aplicación al crear subagentes

El Markdown documenta la política; la selección real se hace mediante `collaboration.spawn_agent`. Cada rol se ejecuta en un subagente separado, con `fork_turns: "none"` y los valores explícitos de `model` y `reasoning_effort` de la tabla. No usar una herencia completa de conversación que impida aplicar los overrides. Si el modelo o esfuerzo requerido no está disponible, informar al usuario antes de sustituirlo.

Cada encargo incluye: ruta de la definición del rol, `CLAUDE.md`, spec y tasks, tareas y AC asignados, contrato OpenAPI pertinente, rama actual, decisiones aprobadas, límites de edición y evidencias que debe devolver. Los subagentes no crean otros subagentes sin un encargo explícito del orquestador.

## Flujo obligatorio

1. Spec, tareas y contrato por spec-writer; aprobación del usuario antes de implementar comportamiento nuevo.
2. Tests por test-writer y comprobación del rojo por la razón correcta.
3. Implementación y refactor con pruebas verdes por backend-dev/frontend-dev; no pueden editar tests.
4. Ataque independiente por adversarial-tester; regresión reproducible y severidad por hallazgo. Los cambios de producción vuelven al implementador.
5. Revisión independiente por reviewer, sin editar archivos; veredicto APROBADO o CAMBIOS REQUERIDOS.
6. Verificación del orquestador, trazabilidad AC → tests, cierre documental y autorización para integrar a main.

El orquestador resuelve disputas de tests con su autor y la spec; no permite debilitar pruebas para obtener verde. Respeta el límite de tres vueltas de implementación/ataque/revisión definido en su rol.

## Concurrencia y contexto

Paralelizar backend y frontend solo con contrato acordado y archivos disjuntos. Compartimos checkout: no permitir escrituras simultáneas en los mismos archivos, cambios concurrentes de rama ni instalaciones simultáneas. Serializar Vitest, cobertura y Playwright cuando usan polleria_test. Los cambios Git de subagentes requieren un encargo específico; la integración a main requiere autorización del usuario.

Reducir contexto a documentos y decisiones pertinentes, conservando la trazabilidad y la evidencia de rojo/verde. No repetir suites completas sin una razón nueva; el orquestador sí ejecuta las verificaciones de cierre exigidas por CLAUDE.md.

## Punto de partida

La 012 está integrada y la siguiente propuesta documentada es la 013 (cocina/impresión). Los 29 fallos de web reproducidos durante onboarding se clasificaron y corrigieron como defectos de sincronización/fixtures de tests por sus dueños, sin cambios de producción. Reviewer aprobó el mantenimiento; la suite completa pasa con 2418 pruebas aprobadas, 6 fallos esperados y 2 omitidas, y tipos/lint pasan. La deuda ADV-002-01/02 se planifica en la propuesta 013. E2E está pendiente de descargar Chromium y aplicar el acceso de red guardado para cdn.playwright.dev. Estos resultados no equivalen a una aprobación de la spec 013 ni a cerrar sus funcionalidades.
