# Plan de desarrollo con agentes – Sistema Pollería

Oct 7, 2026 · @Tael

## 1. Equipo de agentes

Siete agentes construyen el sistema con SDD y TDD. El orquestador corre como sesión principal de Claude Code y los otros seis son subagentes que él invoca. Este diseño es obligatorio: en Claude Code solo la sesión principal puede hacerte preguntas, y el orquestador es quien te reporta ([documentación de subagentes](https://code.claude.com/docs/en/sub-agents.md)).

| Agente | Archivo | Modelo | Responsabilidad |
| --- | --- | --- | --- |
| Orquestador | `.claude/agents/orquestador.md` | opus | Divide el trabajo, delega, valida la definición de terminado, pide tu aprobación y te reporta el avance |
| Spec writer | `.claude/agents/spec-writer.md` | opus | Convierte los requerimientos en specs por funcionalidad, criterios de aceptación, tareas y contrato OpenAPI |
| Test writer | `.claude/agents/test-writer.md` | sonnet | Escribe los tests antes del código y confirma que fallan (fase roja) |
| Backend | `.claude/agents/backend-dev.md` | sonnet | Express + Sequelize + Postgres: modelos, migraciones, endpoints, reglas de negocio e impresión |
| Frontend | `.claude/agents/frontend-dev.md` | sonnet | Next.js + HeroUI + Tailwind: pantallas de mozo, caja y administrador |
| Adversarial tester | `.claude/agents/adversarial-tester.md` | opus | Intenta romper lo que ya pasó los tests: casos borde, concurrencia, seguridad |
| Reviewer | `.claude/agents/reviewer.md` | opus | Revisa calidad, cumplimiento de la spec y que nadie haya modificado tests para hacerlos pasar |

Los modelos son una sugerencia: opus para razonar y criticar, sonnet para implementar. Puedes cambiarlos en el campo `model` de cada archivo.

## 2. Decisiones clave

1. **Contrato de la API primero.** Un archivo OpenAPI (`docs/api/openapi.yaml`) es la frontera entre frontend y backend. El frontend avanza con datos simulados mientras el backend implementa.
2. **Quien escribe los tests no es quien implementa.** El implementador no puede modificar tests; si cree que uno está mal, lo reporta al orquestador. El reviewer lo verifica con el historial de git: los commits `feat:` y `fix:` no pueden tocar archivos de test.
3. **Reglas de dominio para evitar errores clásicos:**
   - El inventario de pollo se lleva en octavos como entero (1 pollo = 8, 1/4 = 2, 1/8 = 1), separado en pecho y pierna.
   - El dinero se guarda en céntimos como entero (S/ 18.50 = 1850).
   - El stock se descuenta en una transacción con bloqueo de fila: si dos mozos piden el último cuarto de pecho a la vez, solo uno lo consigue.
   - El precio se copia al ítem del pedido en el momento de la venta, así un cambio de precio no altera cuentas abiertas.
4. **Impresión detrás de una interfaz.** Un `PrinterService` con un driver falso (escribe la comanda en un archivo) para desarrollo y tests, y uno ESC/POS real para la impresora térmica.
5. **Monorepo en TypeScript:** `apps/web`, `apps/api` y `packages/shared` (tipos, esquemas Zod y reglas de dominio compartidas). Next.js es solo frontend: toda la lógica vive en Express. Socket.IO avisa a mozos y caja.
6. **Herramientas de prueba:** Vitest (unitarias), Supertest contra un Postgres real de prueba en Docker (API), React Testing Library (componentes), Playwright (flujos completos) y fast-check (pruebas por propiedades del adversarial tester).
7. **Constitución del proyecto** en `CLAUDE.md`: stack con versiones fijas, reglas de dominio, glosario, flujo de trabajo y definición de terminado. Claude Code la carga en la sesión principal y en cada subagente.
8. **Puntos de control humano.** Tú apruebas cada spec antes de que se programe y revisas al cierre de cada fase. El orquestador no avanza sin tu visto bueno.
9. **Datos de demostración realistas:** carta de pollería de Huánuco con precios, mesas y stock inicial, para que la demo con el dueño sea creíble.
10. **Idempotencia en pedidos.** Si el mozo toca "Enviar" dos veces por mala señal, no debe imprimirse ni cobrarse dos veces. Cada envío lleva una clave única.

## 3. Fases y ciclo de trabajo

El desarrollo avanza en 7 fases. Cada funcionalidad dentro de una fase sigue el mismo ciclo, y el orquestador no pasa de fase sin tu aprobación.

| Fase | Nombre | Qué entrega | Requerimientos |
| --- | --- | --- | --- |
| 0 | Base del proyecto | Monorepo, Docker con Postgres, lint, typecheck, Vitest, Playwright, endpoint de salud, `PrinterService` con driver de archivo | RNF-05, RNF-07, RNF-12 |
| 1 | Usuarios y carta | Login con PIN, roles, productos, presentaciones, partes, combos y precios | RF-01, RF-18, RF-19, RNF-09, RNF-10 |
| 2 | Mesas y pedidos | Estados de mesa, toma de pedido, adiciones, anulaciones con autorización | RF-02 a RF-07, RNF-01, RNF-02 |
| 3 | Comandas impresas | Impresión automática, ADICIONAL/ANULADO, reimpresión, aviso de impresora caída | RF-08 a RF-11, RNF-03 |
| 4 | Caja y cobro | Pre-cuenta, pagos (efectivo, Yape, Plin, tarjeta), vuelto, división, apertura y cierre | RF-13 a RF-17 |
| 5 | Inventario | Pollos del día en octavos, descuento automático, bloqueo de agotados, compras, alertas | RF-20 a RF-24 |
| 6 | Reportes y demo | Reportes de ventas y merma, auditoría, datos de demostración | RF-25 a RF-27 |

Para llevar y delivery (RF-12) queda fuera del prototipo hasta hablar con el dueño.

**Ciclo de cada funcionalidad:**

1. **Spec.** El spec writer escribe `spec.md`, `tasks.md` y actualiza el contrato OpenAPI.
2. **Aprobación.** El orquestador te muestra la spec y espera tu visto bueno.
3. **Rojo.** El test writer escribe los tests de cada criterio de aceptación y confirma que fallan.
4. **Verde.** Backend y frontend implementan hasta que los tests pasen, sin tocarlos. Pueden trabajar en paralelo porque los separa el contrato.
5. **Ataque.** El adversarial tester intenta romperlo. Cada hallazgo crítico o alto vuelve al paso 4 con un test nuevo que lo demuestra.
6. **Revisión.** El reviewer aprueba o pide cambios; si pide cambios, se vuelve al paso 4.
7. **Cierre.** El orquestador corre la definición de terminado, actualiza `docs/PROGRESS.md` y te reporta.

Si una funcionalidad da 3 vueltas entre los pasos 4 y 6 sin cerrarse, el orquestador se detiene y te consulta.

## 4. Cómo instalarlo en Claude Code

Copia cada archivo de las pestañas de este documento a tu proyecto con la ruta indicada, y arranca Claude Code con el orquestador como agente principal.

1. Crea la carpeta del proyecto (por ejemplo `Escritorio/proyectos1/polleria`) e inicialízala con `git init`.
2. Exporta el documento "Sistema para Pollerías – Planificación" a Markdown y guárdalo como `docs/planificacion.md`. El spec writer lo usa como fuente de requerimientos.
3. Copia el contenido de la pestaña **CLAUDE.md** en un archivo `CLAUDE.md` en la raíz del proyecto.
4. Copia cada archivo de la pestaña **Agentes** en `.claude/agents/` con el nombre indicado.
5. Crea `.claude/settings.json` con este contenido para que el orquestador sea siempre el agente principal:

```json
{
  "agent": "orquestador"
}
```

6. Abre una terminal en la carpeta del proyecto y ejecuta `claude`. También puedes arrancar sin el archivo de configuración con `claude --agent orquestador`.
7. Escribe: **"Inicia la Fase 0"**. El orquestador revisa el estado, planifica y te pide aprobación antes de programar.

Estructura esperada al empezar:

```text
polleria/
├── CLAUDE.md
├── .claude/
│   ├── settings.json
│   └── agents/
│       ├── orquestador.md
│       ├── spec-writer.md
│       ├── test-writer.md
│       ├── backend-dev.md
│       ├── frontend-dev.md
│       ├── adversarial-tester.md
│       └── reviewer.md
└── docs/
    └── planificacion.md
```

Necesitas tener instalados Node.js (versión LTS), pnpm, Docker Desktop y Git. Si creas la carpeta `.claude/agents/` con Claude Code ya abierto, reinícialo para que detecte los agentes.
