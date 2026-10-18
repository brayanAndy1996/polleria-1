# Tareas — 016 Reporte diario

Estado: alcance aprobado el 2026-10-18. S-01 completado (OpenAPI0.13 pending,700refs). T-01: seis casos Luna en874555a/7cce042, rojo por módulo ausente con0 assertions; fixtures corregidas antes de producción. I-01 asignado a Sol6.1 medium; sin verde todavía. API/UI y cierre pendientes.

| ID   | Responsable               | Bloque y evidencia                                                                                                                          |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| S-01 | Principal                 | Aprobar alcance, concretar schemas/puertos y añadir operación pending en OpenAPI0.13.                                                       |
| T-01 | Luna medium test-writer   | Rojo pequeño compartido: calendario, suma entera/conciliación, presentaciones/cremas/combos y autores; AC-02…06.                            |
| I-01 | Sol6.1 medium implementer | Agregación monetaria pura y schemas mínimos; sin tocar cobros ni stock.                                                                     |
| T-02 | Luna medium test-writer   | Rojo servicio/API real: roles, límite Lima, snapshot, atribución y lectura consistente/no mutación; AC-01…07.                               |
| I-02 | Sol6.1 medium implementer | Servicio de lectura y ruta/controller; solo cambios necesarios.                                                                             |
| T-03 | Luna medium test-writer   | UI/cliente: fecha, respuesta tardía, vacío/error y conciliación visible; un E2E real pertinente. AC-08/09.                                  |
| I-03 | Luna medium implementer   | UI admin con skills del proyecto, estilo existente y sin nuevas dependencias.                                                               |
| R-01 | Principal                 | Revisión de definición de venta, límites, precisión, conciliación y acceso; hallazgos al rol correspondiente.                               |
| C-01 | Principal                 | Cobertura global/tipos/lint/build, E2E serializado, QA360/768/1440, contrato implemented y evidencia; solicitar revisión antes de integrar. |

Máximo un test-writer y un implementer activos; no iniciar implementer hasta disponer de rojo ejecutable. Reutilizar evidencia fiable, no contar filtradas/esperadas como aprobadas, no inventar TDD retrospectivo ni revisión independiente.
