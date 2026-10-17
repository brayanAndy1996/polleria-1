# Interfaz de inventario 015

Dirección: extender FigCraft azul/Nunito ya aprobado para la pollería; no rediseñar la app. Base #EFF8FF, superficie #FFFFFF, texto #1E3A8A, acción #3B82F6, selección #60A5FA y peligro #A52A2A. Reutilizar los tokens de globals.css y cifras tabulares. El foco y los colores de estado siempre acompañan texto. No fotos nuevas ni fuentes/dependencias externas.

## Pantalla de administración

Ruta `/admin/inventario`, enlazada desde Administración. Un título y acceso de vuelta; bloques operativos de Pollo, Bebidas y Movimientos. El saldo es lectura: los formularios crean entradas/ajustes, no sobrescriben lo que se ve.

```text
PC:    [Inventario                       Actualizado…]
       [Pollo: pecho / pierna           ][Registrar tanda o ajuste]
       [Bebidas: producto / unidades    ][Entrada o ajuste        ]
       [Movimientos y cargar siguientes                        ]
Móvil: [Inventario]
       [Pollo y su control]
       [Formulario contextual]
       [Bebidas por filas]
       [Movimientos]
```

Todo alineado a la izquierda; números comparables alineados al final. Pollo en octavos con equivalencia legible en cuartos completos/resto si se muestra; registrar tanda pide pollos enteros y anticipa ×4 por parte. Bebidas en unidades. Texto persistente: «El saldo se conserva al cambiar de día». Control desactivado: «Sin control de stock», nunca infinito ni stock suficiente afirmado.

Formularios con labels de unidad/motivo, números enteros y ejemplos. Ajuste aclara si agrega o retira; motivo obligatorio. Vista previa de cambio con saldo leído orientativo; la API decide ante carreras. Entradas deshabilitadas si el recurso no está activado, con acción clara para activarlo. Confirmar desactivación mediante diálogo accesible que muestra recurso y efecto; no borrar saldo/historial.

Resumen de revisión antes de enviar, botón con acción específica y estado «Registrando…». Mientras la respuesta sea incierta (red/500/201 inválido), congelar clave/cuerpo y ofrecer reintento exacto; no permitir editar y generar una nueva solicitud accidental. Después de error definitivo que garantiza rollback, permitir corregir con una nueva revisión. No regenerar claves por render/polling. Foco en primer error o resumen enlazado a campos, sin perder borrador; mensajes siempre en español.

Historial paginado de50, conserva las páginas cargadas. Identifica movimiento, recurso/unidad, delta, saldo resultante, motivo, actor y fecha Lima del servidor. Leer nombres históricos copiados. Vacío orienta a registrar la primera entrada; error ofrece reintentar sin borrar filas previas.

## Carta del mozo

Integrar disponibilidad en `/mozo/mesas/[tableId]/agregar/page.tsx`, conservando aria-labels existentes de botones de producto. Polling visible y al recuperar foco; no remontar OrderComposer ni ItemEditor por un cambio de stock.

Mostrar disponibilidad por parte y bebida. No deshabilitar todo un producto chicken cuando solo se agotó una parte: bloquear la presentación/distribución concreta imposible. Sumar carrito completo más el candidato, incluidas bebidas de combos; adaptar a `calculateInventoryDemand` respetando cantidades copiadas. Un pollo controlado sin consumo definido explica que requiere configuración.

Un fallo de disponibilidad es «Disponibilidad sin confirmar» con reintento; no se transforma en cero ni suficiente. El servidor sigue comprobando la venta. Al recibir INSUFFICIENT_STOCK, conservar carrito, releer existencias y mostrar faltantes concretos; no enviar automáticamente con otra clave. Se puede reducir la tanda.

Importante: un envío con respuesta perdida puede haber consumido el saldo. En ese estado, reintentar el mismo cuerpo/clave aunque la lectura nueva muestre agotado; un bloqueo preventivo del cliente no debe impedir recuperar el replay. Congelar la edición de esa tanda hasta resolver la respuesta incierta. Rechazos definitivos400/409 permiten corregir explícitamente; no asumir que un500 garantiza ausencia de commit.

## Movimiento y accesibilidad

Motion existente solo en confirmación/feedback de acciones, con transform/opacity breve y reduced motion del proveedor. Los saldos se muestran inmediatamente con su valor exacto; sin contador animado ni secuencias decorativas de tarjetas. Diálogos con foco contenido, Escape/cancelar antes del envío y retorno al control de origen; foco visible y botones táctiles de48px como la app.

Validar360/768/1440, nombres/motivos largos, zoom, navegación por teclado y ausencia de controles ocultos por la barra inferior. Formularios y errores accesibles; no usar solo toast ni color. Evitar overflow, fijar min-width:0 en hijos flex y dejar envolver texto humano.

## Puertos para T-04 / I-04

- Cliente en `apps/web/src/lib/api/inventory.ts`: `getInventory()`, `getInventoryAvailability()`, `listInventoryMovements(afterId?)`, `setChickenControl(body,key)`, `setDrinkControl(productId,body,key)`, `addChickenBatch(body,key)`, `addDrinkReceipt(productId,body,key)` y `adjustInventory(body,key)`. GET devuelve el schema directo, no un envelope nuevo. Controles esperan200; entradas/ajustes201; validar cada respuesta shared conservando status real ante cuerpo inválido. Patrón existente payments.ts.
- Helper en `apps/web/src/lib/inventory-demand.ts`: `calculateCartInventoryDemand(products,lines)` devuelve InventoryDemand de shared y `inventoryShortages(snapshot,demand)` devuelve recursos insuficientes con kind/productId/available/required. `InventoryCartLineInput` solo requiere productId/quantity/portion/cut/breastEighths/legEighths/components, compatible estructuralmente con CartLine existente; portion/cut nullable internos, components nullable. No confundir null interno con campos opcionales del request010.
- El helper resuelve categoría y receta desde MenuProduct (componentes desde item.product de la receta aunque no aparezcan en la lista principal), calcula pollo directo por presentación/distribución y cantidad de línea, y componentes por receta y cantidad externa, antes de llamar a shared. No tratar un producto ausente como consumo0: marcar disponibilidad sin confirmar y dejar a API validar. No sumar cremas/extras ni padre de combo.
- Página admin `/admin/inventario/page.tsx` con RoleGuard /admin y componente `components/inventory/inventory-admin.tsx` export InventoryAdmin. Tests en sus archivos .test.ts/.test.tsx homónimos; mozo añade pruebas junto a su página actual. Se permite extraer subcomponentes sin cambiar estos puertos.
- E2E en `e2e/inventory.spec.ts`, usando harness existente y polleria_test. Para respuesta perdida real, interceptar el primer POST desde Playwright, ejecutar route.fetch() contra API real y comprobar201 antes de route.abort(); el segundo envío va al servidor con misma clave/cuerpo. No atribuir un mock de201 como integración de base de datos ni sustituir el recorrido móvil por falta de fixtures.

## Fuentes y ajuste al brief

Leídas frontend-design, web-design-guidelines y ui-ux-pro-max del proyecto. La primera búsqueda genérica recomendó un escaparate y fuentes de restaurante: no se aplican a este POS. La búsqueda explícita product/inventory management sí identificó monitorización operativa densa; se conserva esa jerarquía, sin sustituir paleta/tipografía FigCraft. La búsqueda de validación aportó resumen enfocable y errores junto a campos. Las recomendaciones de Server Actions no sustituyen Express/TanStack Query ni el contrato aprobado.

Guías consultadas para la revisión: [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) (labels, foco, estados y responsive) y [Motion accessibility](https://motion.dev/docs/react-accessibility) (preferencia de movimiento reducido). Se aplicarán sobre código/capturas reales antes de cerrar; esta planificación no constituye QA visual.
