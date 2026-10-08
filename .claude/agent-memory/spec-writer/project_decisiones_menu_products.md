---
name: decisiones-menu-products
description: Propuesta de la spec 005 (productos y precios de la carta, en Borrador pendiente de aprobación): tabla products con categorías fijas, priceCents 0..99999, nombre único con lower(name), desactivar sin borrar, GET para cualquier rol, contrato 0.5.0; límites frente a 006/007/008
metadata:
  type: project
---

Spec 005 (docs/specs/005-menu-products/spec.md), escrita el 2026-10-08 en feat/005-menu-products, **en Borrador** (los supuestos S-005-01 a S-005-11 esperan respuesta del usuario; verificar si fue aprobada antes de apoyarse en esto). OpenAPI 0.5.0. Una migración: 20261008180000-create-products.ts. Sin variables de entorno nuevas, sin frontend (pantallas = spec 008).

- Modelo products: id SERIAL, name varchar(60) (CHECK no vacío + trim), category varchar(16) (CHECK con lista), price_cents integer (CHECK 0..99999), is_active bool default true, created_at/updated_at timestamptz. Índice único por expresión `products_name_unique` sobre `lower(name)` (sin distinguir mayúsculas, incluye inactivos). Sin FK ni índices extra (la carta se lee entera y se ordena en el servicio).
- Categorías fijas en `PRODUCT_CATEGORIES` = ['chicken','dish','drink','dessert','sauce','extra'] en ese orden = orden de la carta (etiquetas es: Pollo, Platos, Bebidas, Postres, Cremas, Extras). 'combo' NO existe todavía: la 007 decide si es categoría (migración que amplíe el CHECK) o tabla propia. 'sauce' permite cremas de precio 0 (salen en comanda). 'extra' cubre descartables/empaque vendibles (insumo con stock = Fase 5).
- productNameSchema: recorte, NFC, 1..60 puntos de código, patrón /^[\p{L}\p{N}][\p{L}\p{M}\p{N} .,'()/%+-]*$/u (permite '1/4 de Pollo', 'Inca Kola 1.5 L', '(jarra)', '+'). Un solo mensaje PRODUCT_NAME_MESSAGE.
- priceCentsSchema: z.number().int() 0..99999 (S/ 999.99 tope anti-tipeo 185000; '1850' o 18.5 → 400). PRICE_CENTS_MAX = 99999.
- Orden de la carta SIN sort_order: categoría en el orden del enum, nombre con Intl.Collator('es',{sensitivity:'base'}), empates por id (igual que usuarios). Si el dueño pide orden manual, spec posterior.
- Rutas: GET /api/products (requireAuth, cualquier rol, devuelve activos e inactivos en el orden de la carta; quien consume la vigente filtra isActive), POST /api/products (requireRole('admin'), 201), PATCH /api/products/{productId} (admin, 200; name/category/priceCents/isActive, minProperties 1, 'No indicaste ningún cambio.'). Sin DELETE ni detalle (RN-005-04: se desactiva, nunca se borra — igual que usuarios). '/api/products' suma a NO_STORE_PATH_PREFIXES (lección ADV-004-25: la cabecera va antes del lector del cuerpo).
- Códigos nuevos en ERROR_CODES: PRODUCT_NOT_FOUND (404 'Ese producto no existe.'), PRODUCT_NAME_TAKEN (409 'Ya existe un producto con ese nombre.'). productId de ruta: ^[0-9]+$, 1..2147483647, si no 400 con issue 'El identificador del producto no es válido.' (misma regla que userId).
- Servicio createProductService({ models }): listProducts, createProduct, updateProduct; UniqueConstraintError → PRODUCT_NAME_TAKEN. Sin transacciones (no hay invariante entre filas, a diferencia de LAST_ADMIN_REQUIRED).
- Regla de dominio 4 declarada como RN-005-08 (el ítem del pedido copiará el precio; sin pedidos todavía). La 006 agrega presentaciones/partes sobre 'chicken' y decide cómo convive con price_cents; pendientes del dueño para 006: ¿vende 1/8?, ¿armado del 1/2?, ¿pecho vs pierna?; para Fase 5: vasos por jarra, descartables como insumo.
- Helpers de prueba afectados: resetMigrationTables debe borrar también products y hay un clearMenuTables nuevo (TRUNCATE products RESTART IDENTITY) con la doble verificación _test.
- El usuaria con varios roles en pruebas: waiter+admin permite escribir (basta un rol permitido), waiter+cashier da 403.

**Why:** las decisiones de categorías fijas, el índice por expresión lower(name), el tope de precio anti-tipeo y la lectura abierta a todos los roles no son obvias y las specs 006/007/008 construyen encima.
**How to apply:** en 006 usar la categoría 'chicken' como gancho de presentaciones; en 007 decidir categoría 'combo' vs tabla; en 008 consumir GET/POST/PATCH /products tal cual (la lista ya viene ordenada y se agrupa por el enum). Ver [[decisiones-modelado]], [[decisiones-users-admin]] y [[forma-de-las-specs]].
