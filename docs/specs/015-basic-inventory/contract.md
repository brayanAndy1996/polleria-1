# Contrato técnico 015 — S-01, 2026-10-17

Spec aprobada con saldos permanentes P-03 y sin reposición automática P-02. OpenAPI 0.12.0 es el contrato HTTP; este documento concreta persistencia, locks y puertos compartidos. Sus ocho operaciones se marcaron implemented al cerrar la verificación el 2026-10-18; evidencia en verification.md.

## Shared y cálculos puros

Nuevo `packages/shared/src/inventory.ts`, exportado desde index.ts. Constantes: `INVENTORY_QUANTITY_MAX=2147483647`, `INVENTORY_CHICKENS_MAX=10000`, `INVENTORY_RECEIPT_MAX=100000`, `INVENTORY_ADJUSTMENT_MAX=100000`. Recursos `InventoryKind='breast'|'leg'|'drink'`. Motivo recortado de 1…200 caracteres.

Requests estrictos:

- `inventoryControlRequestSchema`: `{enabled:boolean,reason:string}`.
- `inventoryBatchRequestSchema`: `{chickens:integer1…10000,reason:string}`.
- `inventoryReceiptRequestSchema`: `{quantity:integer1…100000,reason:string}`.
- `inventoryAdjustmentRequestSchema`: `{kind,productId:number|null,delta:integer-100000…100000 distinto de0,reason}`. productId positivo para drink y null para breast/leg.
- `inventoryQuerySchema`: `{afterId?:integer positivo}` sin coerción; HTTP convierte únicamente texto decimal positivo canónico y luego valida. Query extra/repetido/objeto se rechaza.

Respuestas estrictas y tipos homónimos sin sufijo Schema:

- `inventorySnapshotSchema` → `InventorySnapshot`: `{chicken:{enabled,breastEighths,legEighths},drinks:[{productId,productName,enabled,quantity}],generatedAt:ISO UTC}`. GET incluye todos los productos drink (también inactivos), por id ascendente, aun sin fila de control (false/0); no se crean filas al leer. Un recurso configurado conserva su nombre actual; snapshot del movimiento conserva el histórico.
- `inventoryMovementSchema` → `InventoryMovement`: `{id,kind,productId:number|null,productName:string|null,type:'batch'|'receipt'|'adjustment'|'consumption'|'control',delta:integer,quantityAfter:integer0…MAX,enabledAfter:boolean|null,reason:string,actor:{id,displayName},ticketId:number|null,createdAt:ISO UTC}`. Solo control admite delta0 y exige enabledAfter boolean; los demás delta no0 y enabledAfter null. Solo consumption lleva ticketId positivo; otros null. Producto/nombre no nulos solo para drink.
- `inventoryMutationResponseSchema` → `InventoryMutationResponse`: `{inventory:InventorySnapshot,movements:InventoryMovement[]}`.
- `inventoryMovementsResponseSchema`: `{movements:InventoryMovement[],nextAfterId:number|null}`; 50 registros por página, ascendente y lookahead de1. Consulta después del último id; sin filtros añadidos.

Funciones puras:

- `chickenBatchEighths(chickens:number):{breastEighths,legEighths}` valida entrada y devuelve ×4 por parte.
- `applyInventoryDelta(quantity:number,delta:number):number` exige enteros/rango, delta no0 y resultado0…MAX; lanza RangeError sin modificar argumentos cuando falla.
- `calculateInventoryDemand(items:readonly InventoryConsumptionItem[]):InventoryDemand`.
- `InventoryConsumptionItem`: `{productId:number,category:ProductCategory,quantity:number,breastEighths:number,legEighths:number,components:readonly InventoryConsumptionComponent[]}`.
- `InventoryConsumptionComponent`: `{productId:number,category:ProductCategory,quantity:number,breastEighths:number,legEighths:number}`.
- `InventoryDemand`: `{breastEighths:number,legEighths:number,drinks:{productId:number,quantity:number}[],undefinedChickenProductIds:number[]}`. Productos/recursos acumulados, ids únicos ascendentes, sin mutar entrada. Directo chicken: usar octavos copiados (ya incluyen cantidad de línea). Combo: multiplicar cada componente por cantidad de combos; octavos del componente ya incluyen cantidad de receta, bebida usa receta×combos. No sumar el agregado del padre del combo. Chicken con ambos octavos0 añade su id a undefinedChickenProductIds; el servicio solo rechaza si el control de pollo está activo. No inferir pollo desde nombres. Validar enteros positivos de cantidades/ids y no negativos de octavos, rangos y acumulaciones; RangeError ante desbordamiento. No recibe reloj: consumo y saldo no dependen de fechas.

Coherencia adicional de movimientos: batch solo breast/leg con delta positivo; receipt solo drink con delta positivo; consumption delta negativo; adjustment delta distinto de cero. Validar tanto en shared como con CHECKs SQL. ERROR_CODES agrega los seis conflictos de esta entrega sin reemplazar códigos anteriores.

## Modelo SQL y modelos Sequelize

Migración `20261017120000-create-inventory.ts` reversible y transaccional. Cuatro tablas, sin agregar campos públicos a modelos antiguos:

1. `inventory_state`: id INTEGER PK CHECK(id=1), chicken_enabled BOOLEAN NOT NULL DEFAULT false, breast_eighths y leg_eighths INTEGER NOT NULL DEFAULT0 CHECK>=0. Inserta solo la fila1, desactivada y saldo0. Es también la puerta de serialización de las escrituras de inventario.
2. `inventory_drinks`: product_id INTEGER PK, product_category VARCHAR(16) NOT NULL DEFAULT 'drink' CHECK='drink', enabled BOOLEAN NOT NULL DEFAULT false, quantity INTEGER NOT NULL DEFAULT0 CHECK>=0. FK compuesta `(product_id,product_category)` a products(id,category) mediante UNIQUE nuevo `products_id_category_inventory_unique`; nombre de FK `inventory_drinks_product_category_fkey`, ON UPDATE/DELETE RESTRICT. Así no puede recategorizarse una bebida con registro de inventario y perder su trazabilidad, aunque esté desactivada. PATCH products traduce esa FK a409 PRODUCT_HAS_INVENTORY; no se reescribe el servicio de catálogo. Renombrar, precio/isActive y demás guardias anteriores permanecen.
3. `inventory_movements`: id SERIAL PK, kind VARCHAR, product_id nullable FK products, product_name histórico nullable, type VARCHAR, delta INTEGER, quantity_after INTEGER>=0, enabled_after BOOLEAN nullable, reason VARCHAR(200), actor_user_id FK users, actor_display_name histórico, ticket_id nullable FK kitchen_tickets, created_at TIMESTAMPTZ. CHECKs de recurso/tipo/delta/campos coherentes según shared; índices por id y ticket_id. Movimientos de consumo agrupados por recurso/comanda: UNIQUE parcial(ticket_id,kind,coalesce(product_id,0)) WHERE type='consumption'. No backfill.
4. `inventory_commands`: key VARCHAR(128) PK, request_hash CHAR(64), response_status INTEGER IN(0,200,201), response_body JSONB objeto, actor_user_id FK users, created_at TIMESTAMPTZ. Estado0 solo dentro de transacción antes de guardar respuesta; ningún camino exitoso confirma0.

`defineModels` expone InventoryState/InventoryDrink/InventoryMovement/InventoryCommand; tipos en nuevo models/inventory.ts. No borrar/modificar movimientos desde API. El historial lee campos copiados, no nombres de usuario/producto actuales.

## Servicio e integración

`createInventoryService({models,now?})`, actor `{userId:number}`. Métodos:

- `getInventory(actor)` admin; `getAvailability(actor)` waiter/admin; `listMovements(afterId,actor)` admin.
- `setChickenControl(body,key,actor)`, `setDrinkControl(productId,body,key,actor)` → mutation, HTTP200.
- `addChickenBatch(body,key,actor)`, `addDrinkReceipt(productId,body,key,actor)`, `adjust(body,key,actor)` → mutation, HTTP201.
- `consume(demand:InventoryDemand,ticketId:number,actor,transaction:Transaction):Promise<void>` usa transacción del envío, sin commit propio ni I/O externo.

Toda lectura/escritura comprueba usuario activo y roles actuales también en servicio. GETs con REPEATABLE READ y sin creación de filas. Escrituras administrativas: validar schema/key, autorizar, claim de command key (hash de operación/ruta + body normalizado), replay original antes de comprobar saldo/control/producto, lock fila inventory_state1 FOR UPDATE, filas inventory_drinks por productId ascendente FOR UPDATE. Mismo key con ruta/body distintos:409 IDEMPOTENCY_CONFLICT. No incorporar actor al hash; cualquier admin autorizado puede reintentar la misma operación y recibe la respuesta histórica original. El actor original permanece copiado. Guardar status/body junto con movimientos/saldo, o rollback completo.

Para entradas/ajustes el recurso debe estar activado; de lo contrario409 INVENTORY_DISABLED. Control siempre permite activar/desactivar (incluido mismo valor con key nueva) y crea evento control para cada recurso afectado, delta0/quantityAfter actual/enabledAfter objetivo. Primera activación empieza0; posteriores conservan saldo. Bebida inexistente404 PRODUCT_NOT_FOUND; categoría no drink409 INVENTORY_PRODUCT_INVALID. Desactivar requiere reason y confirmación UI. No usar un boolean de confirmación extra en la API.

`sendItems`: releer usuario activo con rol waiter/admin en el servicio, también para reintentos directos, antes del claim (sin consultar stock/catálogo ni tomar sus locks). Después conserva claim/replay temprano de la010 → pedido NO KEY UPDATE → validación/resolución de catálogo → comanda → `consume` con demanda calculada del servidor → ítems/componentes/impresión durable/replay → commit. Así un rol revocado no recupera replay por llamada directa; un usuario autorizado sí lo recibe antes de evaluar pedido/control/stock actuales. Puerta de inventario lock inventory_state1 FOR UPDATE; después productos de las bebidas demandadas en orden id ascendente FOR KEY SHARE y luego bebidas activas en orden productId ascendente FOR UPDATE. Este orden padre antes de hijo también rige administración: evita que el FK del movimiento espere al padre mientras PATCH de categoría retiene ese padre y espera al hijo inventariado. Reutilizar los productos bloqueados para copiar nombres; no adquirir por primera vez un lock padre después de bloquear su saldo hijo. Comandos administrativos nunca toman locks de pedido/mesa. Registrar `MIGRATION_LOCK_KEY` aparte: inventario usa filas, no reutiliza advisory lock de migración. Esta puerta común prioriza corrección para el local (5 dispositivos); las lecturas no toman esa puerta.

Consumo activo: comprobar todos los faltantes antes de escribir, rechazar undefinedChickenProductIds si chicken_enabled; saldos no negativos y movimientos negativos por recurso con actor/hora/ticket/motivo 'Envío a cocina'. Off significa no descontar, sin evento de consumo para ese recurso. No retornar stock al anular; no modificar servicios de cobros/mover/unir/separar para descontar. Si no se inyecta InventoryService en createOrderItemService, crear uno con models para que llamadas directas también respeten stock; nunca saltar inventario por falta de inyección. En createApp inyectar instancia compartida y reloj para pruebas.

La FK compuesta resuelve atómicamente la carrera activación/recategorización. Los snapshots usados para demanda mantienen semántica vigente de cantidades. No alterar producción antigua para normalizar datos históricos ni usar datos del cliente como disponibilidad final.

## Errores

Todos con envelope existente y no-store temprano, incluido lector global:

- 409 INSUFFICIENT_STOCK: 'No hay stock suficiente para enviar el pedido.' details `{shortages:[{kind,productId:number|null,available,required}]}`. Orden breast,leg,drink/productId. Ninguna mutación/clave de envío confirmada.
- 409 STOCK_CONSUMPTION_UNDEFINED: 'Configura el consumo de pollo antes de vender este producto.' details `{productIds:number[]}`.
- 409 INVENTORY_DISABLED: 'Activa el control de stock antes de registrar este movimiento.'
- 409 INVENTORY_PRODUCT_INVALID: 'El control por unidades solo se aplica a bebidas.'
- 409 INVENTORY_QUANTITY_OUT_OF_RANGE: 'El movimiento deja el stock fuera del rango permitido.' Sin detalles internos/SQL.
- 409 PRODUCT_HAS_INVENTORY: 'El producto tiene historial de inventario y no puede cambiar de categoría.'
- 409 IDEMPOTENCY_CONFLICT existente; 400 VALIDATION_ERROR; 401/403/404 existentes. Body/input inválido es400; saldo negativo/desbordamiento de cálculo es409. Nunca filtrar URLs/credenciales/SQL.

## HTTP y compatibilidad

Ocho rutas de spec, sin envelopes extra en GET. afterId solo decimal positivo canónico; límites de body existentes. Headers no-store en éxito/error. Reads ignoran cuerpo, sin permitir query extra. Nuevo no-store prefijo /api/inventory antes del lector JSON. Endpoints de pedidos conservan schemas de éxito y errores anteriores; agregar conflictos inventario a su409 en OpenAPI. Endpoints de products conservan schemas y agregan PRODUCT_HAS_INVENTORY a409. No cambiar errores de 013/014 ni permisos de cocina/caja.

## UI y TDD

Luna escribe primero pruebas puras y schemas T-01 con este puerto, luego Luna implementa I-01. T-02/T-03 con PostgreSQL guardado y serializado; implementer complejo GPT-6.1-sol medium. Movimientos permiten paginación y controles sin borrar estado de formularios. Todos los AC siguen vigentes con AC-09 de saldos permanentes. No cerrar hasta QA, cobertura, tipos/lint/build y E2E reales.

Limpieza autorizada exclusivamente en `_test`: helpers pueden truncar/borrar inventory_commands, inventory_movements, inventory_drinks e inventory_state con guardias existentes; en limpieza entre casos conservar/recrear fila1 desactivada y saldos0. resetMigrationTables elimina las tablas nuevas antes de sus padres; clearMenuTables incluye inventory_drinks/movements por FK a products; clearOrderTables incluye movements por FK a tickets. migrateAndClearAuthTables reinicia configuración/saldos de inventario para no contaminar regresiones existentes. Mantener tableExists para la fase roja. Actualizar expectativas de down/up de migraciones antiguas sin eliminar ninguna assertion de dominio. No crear bases/roles.
