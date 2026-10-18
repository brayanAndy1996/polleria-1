# Tareas — 016 Reporte diario

Estado: alcance aprobado el 2026-10-18. S-01 y T/I-01 completados (OpenAPI0.13 pending,700refs). Dominio `e721a2d`, verde dirigido4 archivos/69 pruebas, tipos/lint/formato shared aprobados. T-02 Luna en escritura; I-02 todavía no iniciado. API/UI y cierre pendientes. Evidencia y límites en verification.md.

Decisiones posteriores del usuario: posponer diseño/pulido visual hasta el final, conservar interfaz funcional. Luna agotó cuota en T-02; autorizó reemplazo Sol6.1 low para pruebas y UI sencilla016, separado de Sol medium financiero. Esa excepción prevalece sobre modelos de la tabla anterior al cambio. Test-writer reemplazo completa los dos archivos parciales y corrige fixtures; no se atribuye verde todavía.

| ID   | Responsable               | Bloque y evidencia                                                                                                                           |
| ---- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| S-01 | Principal                 | Aprobar alcance, concretar schemas/puertos y añadir operación pending en OpenAPI0.13.                                                        |
| T-01 | Luna medium test-writer   | Rojo pequeño compartido: calendario, suma entera/conciliación, presentaciones/cremas/combos y autores; AC-02…06.                             |
| I-01 | Sol6.1 medium implementer | Agregación monetaria pura y schemas mínimos; sin tocar cobros ni stock.                                                                      |
| T-02 | Luna medium test-writer   | Rojo servicio/API real: roles, límite Lima, snapshot, atribución y lectura consistente/no mutación; AC-01…07.                                |
| I-02 | Sol6.1 medium implementer | Servicio de lectura y ruta/controller; solo cambios necesarios.                                                                              |
| T-03 | Luna medium test-writer   | UI/cliente: fecha, respuesta tardía, vacío/error y conciliación visible; un E2E real pertinente. AC-08/09.                                   |
| I-03 | Luna medium implementer   | UI admin funcional con componentes existentes, sin pulido visual, animaciones nuevas ni dependencias; diseño pospuesto por el usuario.       |
| R-01 | Principal                 | Revisión de definición de venta, límites, precisión, conciliación y acceso; hallazgos al rol correspondiente.                                |
| C-01 | Principal                 | Cobertura global/tipos/lint/build, E2E funcional serializado, contrato implemented y evidencia; comparación visual pospuesta hasta el final. |

Máximo un test-writer y un implementer activos; no iniciar implementer hasta disponer de rojo ejecutable. Reutilizar evidencia fiable, no contar filtradas/esperadas como aprobadas, no inventar TDD retrospectivo ni revisión independiente.
