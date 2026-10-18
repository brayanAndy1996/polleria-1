# Contrato propuesto — 016

Alcance aprobado el 2026-10-18. Todavía no hay endpoints ni schemas implementados de016. S-01 añade OpenAPI0.13 con la nueva operación pending.

## Consulta

`GET /reports/daily-sales`, query estricta `{date?: YYYY-MM-DD}` de fecha real, año0001…9999 (PostgreSQL no admite año0). Ausencia significa día actual de America/Lima según reloj inyectado del servidor. No permitir arrays, query repetida u otras claves. Sin cuerpo relevante. Admin actual y activo, no-store antes de auth/validación.401/403/400 usan los errores existentes.

Respuesta directa propuesta, sin envelope adicional:

```ts
{
  date: string; // YYYY-MM-DD efectivo
  timeZone: 'America/Lima';
  generatedAt: string; // ISO UTC
  totalCents: number; // entero seguro no negativo
  paymentCount: number; // entero seguro no negativo
  methods: Array<{ method: PaymentMethod; totalCents: number; paymentCount: number }>;
  hours: Array<{ hour: number; totalCents: number; paymentCount: number }>;
  products: Array<{
    productId: number;
    productName: string;
    productCategory: ProductCategory;
    portion: Portion | null;
    cut: Cut | null;
    quantity: number;
    totalCents: number;
  }>;
  authors: Array<{ userId: number; displayName: string; totalCents: number }>;
}
```

- methods contiene exactamente cash/yape/plin/card en ese orden; hours exactamente0…23. No duplicados ni omisiones; ceros en grupos sin cobros. products/authors vacíos cuando no hay pagos.
- Productos por total descendente, cantidad descendente y desempate por id/nombre/categoría/presentación/parte con comparación determinista. Autores por total descendente y userId ascendente. Sin nombres actuales de la carta en las filas históricas.
- Validar rangos enteros y conciliación. Acumular sin perder precisión; si un resultado no cabe en Number.MAX_SAFE_INTEGER, devolver error explícito en vez de convertir/redondear. Error propuesto500 REPORT_DATA_INVALID para snapshot/asociación/conciliación inválida y500 REPORT_TOTAL_OUT_OF_RANGE para desbordamiento seguro; no devolver snapshot, PIN, tokens o SQL en details.

## Lectura y origen

Transacción de lectura consistente REPEATABLE_READ: verificar usuario actual, seleccionar pagos por rango de paidAt equivalente al día Lima y resolver autores de los ids de ítem del snapshot en la misma lectura. No SELECT FOR UPDATE sobre stock, escritura de historial ni pago nuevo. Columnas del pago y snapshot deben coincidir; usar schemas014 existentes. No modificar formato de snapshots anteriores ni reescribir pagos.

El snapshot del pago aporta importes, productos/presentaciones y líneas no anuladas. OrderItem se consulta para identificar el autor original y verificar la pertenencia al pedido pagado; no recalcular precios ni excluir líneas por estado mutable actual. El usuario actual aporta etiqueta y no se filtra por isActive/rol para el desglose histórico. Una asociación requerida ausente no equivale a importe cero. Un id de ítem repetido en el mismo snapshot se rechaza, no se cuenta dos veces.

Shared: `packages/shared/src/reports.ts`, exportado desde index.ts. Exportar `salesDateSchema` (fecha de calendario YYYY-MM-DD real), `dailySalesQuerySchema` (date opcional, objeto estricto), `dailySalesReportSchema`, `DailySalesQuery`, `DailySalesReport` y función pura `buildDailySalesReport({date, generatedAt, payments, itemAuthors})`. payments es readonly Payment[] de014; itemAuthors es ReadonlyMap<number, UserRef> indexado por id de ítem. No mutar pagos ni mapa. Validar pagos y autores, rechazar ids de pago/pedido/ítem duplicados, autores ausentes y pagos fuera del día solicitado. Usar toLimaDateTimeParts existente para hora/fecha. Etiquetas distintas para el mismo userId dentro de una lectura son datos incoherentes. Comparaciones textuales deterministas con `<`/`>`, sin localeCompare; null equivale a cadena vacía solo para desempate.

La función pura lanza TypeError para datos/fecha/asociación inválidos y RangeError para acumulación fuera del entero seguro. El servicio traduce esas excepciones a los dos errores públicos propuestos; no expone entradas ni detalles internos. La validación de respuesta también comprueba conciliación sin perder precisión. No usa reloj global; generatedAt es explícito.

API: `apps/api/src/services/reports/reports.service.ts`, `createReportsService({models, now?})` devuelve `getDailySales(date: string | undefined, actor: {userId:number}): Promise<DailySalesReport>`. Controllers/routes nuevos siguen los patrones existentes y `createApp` comparte su reloj. GET exacto ignora el cuerpo, incluido JSON roto, y fija no-store antes del lector global; no ampliar excepciones a rutas ajenas.

UI: cliente `apps/web/src/lib/api/reports.ts`, `getDailySalesReport(date?:string)`, parseResponse compartido/schema directo. Página `/admin/reportes/page.tsx` y componente `components/reports/daily-sales-report.tsx`, export `DailySalesReportView`. T-03 define interacciones contra estos puertos. Sin fecha inicial decide servidor; la selección nueva usa date explícita. Reutilizar formatCashierSoles/formatSoles existentes (BigInt, importes exactos); no dividir por100 con float para mostrar el máximo seguro.

La conversión de intervalo del día y el acceso SQL pertenecen al servicio. Reutilizar el índice payments(paid_at,id), que ya existe desde014. Mantener010/014/015 intactos; no nueva migración salvo necesidad real demostrada y aprobada.
