import { z } from 'zod';
import { toLimaDateTimeParts } from './lima-time.ts';
import { userRefSchema, type UserRef } from './order-items.ts';
import { PAYMENT_METHODS, paymentMethodSchema, paymentSchema, type Payment } from './payments.ts';
import { cutSchema, portionSchema } from './portions.ts';
import { productCategorySchema } from './products.ts';
import { TIME_ZONE } from './time-zone.ts';

export const salesDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) => {
      const year = Number(value.slice(0, 4));
      const month = Number(value.slice(5, 7));
      const day = Number(value.slice(8, 10));
      const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
      const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]!;
    },
    { message: 'La fecha debe ser una fecha de calendario válida.' },
  );

export const dailySalesQuerySchema = z.strictObject({ date: salesDateSchema.optional() });
export type DailySalesQuery = z.infer<typeof dailySalesQuerySchema>;

const nonnegativeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const productSalesSchema = z.strictObject({
  productId: z.number().int().positive(),
  productName: z.string(),
  productCategory: productCategorySchema,
  portion: portionSchema.nullable(),
  cut: cutSchema.nullable(),
  quantity: nonnegativeInteger.min(1),
  totalCents: nonnegativeInteger,
});
const authorSalesSchema = z.strictObject({
  userId: userRefSchema.shape.id,
  displayName: userRefSchema.shape.displayName,
  totalCents: nonnegativeInteger,
});
type ProductSales = z.infer<typeof productSalesSchema>;
type AuthorSales = z.infer<typeof authorSalesSchema>;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareProducts(left: ProductSales, right: ProductSales): number {
  return (
    right.totalCents - left.totalCents ||
    right.quantity - left.quantity ||
    left.productId - right.productId ||
    compareText(left.productName, right.productName) ||
    compareText(left.productCategory, right.productCategory) ||
    compareText(left.portion ?? '', right.portion ?? '') ||
    compareText(left.cut ?? '', right.cut ?? '')
  );
}

function compareAuthors(left: AuthorSales, right: AuthorSales): number {
  return right.totalCents - left.totalCents || left.userId - right.userId;
}

function productKey(row: Omit<ProductSales, 'quantity' | 'totalCents'>): string {
  return JSON.stringify([
    row.productId,
    row.productName,
    row.productCategory,
    row.portion,
    row.cut,
  ]);
}

function sum(values: readonly number[]): bigint {
  return values.reduce((total, value) => total + BigInt(value), 0n);
}

export const dailySalesReportSchema = z
  .strictObject({
    date: salesDateSchema,
    timeZone: z.literal(TIME_ZONE),
    generatedAt: z.iso.datetime(),
    totalCents: nonnegativeInteger,
    paymentCount: nonnegativeInteger,
    methods: z
      .array(
        z.strictObject({
          method: paymentMethodSchema,
          totalCents: nonnegativeInteger,
          paymentCount: nonnegativeInteger,
        }),
      )
      .length(PAYMENT_METHODS.length),
    hours: z
      .array(
        z.strictObject({
          hour: z.number().int().min(0).max(23),
          totalCents: nonnegativeInteger,
          paymentCount: nonnegativeInteger,
        }),
      )
      .length(24),
    products: z.array(productSalesSchema),
    authors: z.array(authorSalesSchema),
  })
  .superRefine((report, context) => {
    const invalid = () =>
      context.addIssue({
        code: 'custom',
        message: 'Los grupos, el orden y los totales del reporte deben ser coherentes.',
      });
    // Refinements may run after a numeric range failure; never convert an unsafe value.
    const amounts = [
      report.totalCents,
      report.paymentCount,
      ...report.methods.flatMap((row) => [row.totalCents, row.paymentCount]),
      ...report.hours.flatMap((row) => [row.totalCents, row.paymentCount]),
      ...report.products.flatMap((row) => [row.totalCents, row.quantity]),
      ...report.authors.map((row) => row.totalCents),
    ];
    if (amounts.some((value) => !Number.isSafeInteger(value) || value < 0)) return;
    const total = BigInt(report.totalCents);
    const count = BigInt(report.paymentCount);
    const paymentGroups = [...report.methods, ...report.hours];
    if (
      report.methods.some((row, index) => row.method !== PAYMENT_METHODS[index]) ||
      report.hours.some((row, index) => row.hour !== index) ||
      paymentGroups.some(
        (row) =>
          (row.paymentCount === 0) !== (row.totalCents === 0) || row.paymentCount > row.totalCents,
      ) ||
      sum(report.methods.map((row) => row.totalCents)) !== total ||
      sum(report.hours.map((row) => row.totalCents)) !== total ||
      sum(report.products.map((row) => row.totalCents)) !== total ||
      sum(report.authors.map((row) => row.totalCents)) !== total ||
      sum(report.methods.map((row) => row.paymentCount)) !== count ||
      sum(report.hours.map((row) => row.paymentCount)) !== count ||
      (report.paymentCount === 0) !== (report.totalCents === 0) ||
      (report.paymentCount === 0) !== (report.products.length === 0) ||
      (report.paymentCount === 0) !== (report.authors.length === 0) ||
      new Set(report.products.map(productKey)).size !== report.products.length ||
      new Set(report.authors.map((row) => row.userId)).size !== report.authors.length ||
      report.products.some(
        (row, index) => index > 0 && compareProducts(report.products[index - 1]!, row) > 0,
      ) ||
      report.authors.some(
        (row, index) => index > 0 && compareAuthors(report.authors[index - 1]!, row) > 0,
      )
    )
      invalid();
  });
export type DailySalesReport = z.infer<typeof dailySalesReportSchema>;

const maxSafeInteger = BigInt(Number.MAX_SAFE_INTEGER);
const limaEraFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  era: 'short',
});

function safeNumber(value: bigint): number {
  if (value < 0n || value > maxSafeInteger) {
    throw new RangeError('El resultado del reporte excede el rango entero seguro.');
  }
  return Number(value);
}

function add(left: bigint, right: bigint): bigint {
  const result = left + right;
  if (result > maxSafeInteger) {
    throw new RangeError('El resultado del reporte excede el rango entero seguro.');
  }
  return result;
}

interface BuildDailySalesReportInput {
  date: string;
  generatedAt: string;
  payments: readonly Payment[];
  itemAuthors: ReadonlyMap<number, UserRef>;
}

/** Agrega únicamente snapshots cobrados del día indicado; nunca consulta ni modifica el pedido. */
export function buildDailySalesReport({
  date,
  generatedAt,
  payments,
  itemAuthors,
}: BuildDailySalesReportInput): DailySalesReport {
  if (
    !salesDateSchema.safeParse(date).success ||
    !z.iso.datetime().safeParse(generatedAt).success ||
    !Array.isArray(payments) ||
    !itemAuthors ||
    typeof itemAuthors.get !== 'function'
  ) {
    throw new TypeError('Los datos del reporte no son válidos.');
  }
  const methods = PAYMENT_METHODS.map((method) => ({ method, total: 0n, count: 0n }));
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, total: 0n, count: 0n }));
  const products = new Map<string, { row: ProductSales; total: bigint; quantity: bigint }>();
  const authors = new Map<number, { row: AuthorSales; total: bigint }>();
  const paymentIds = new Set<number>();
  const orderIds = new Set<number>();
  const itemIds = new Set<number>();
  let total = 0n;
  let count = 0n;

  for (const input of payments) {
    const parsed = paymentSchema.safeParse(input);
    if (!parsed.success) throw new TypeError('El pago no es un registro histórico válido.');
    const payment = parsed.data;
    if (paymentIds.has(payment.id) || orderIds.has(payment.orderId)) {
      throw new TypeError('El reporte contiene pagos o pedidos duplicados.');
    }
    paymentIds.add(payment.id);
    orderIds.add(payment.orderId);
    const paidAt = new Date(payment.paidAt);
    // El helper devuelve el año sin era: 1 a. C. también se representa como "0001".
    if (
      paidAt.getUTCFullYear() <= 1 &&
      limaEraFormatter.formatToParts(paidAt).find((part) => part.type === 'era')?.value !== 'AD'
    ) {
      throw new TypeError('El pago no pertenece a un año válido del reporte.');
    }
    const parts = toLimaDateTimeParts(paidAt);
    if (`${parts.year}-${parts.month}-${parts.day}` !== date) {
      throw new TypeError('El pago no pertenece al día del reporte.');
    }
    const method = methods[PAYMENT_METHODS.indexOf(payment.method)]!;
    const hour = hours[Number(parts.hour)]!;
    const amount = BigInt(payment.amountCents);
    total = add(total, amount);
    count = add(count, 1n);
    method.total = add(method.total, amount);
    method.count = add(method.count, 1n);
    hour.total = add(hour.total, amount);
    hour.count = add(hour.count, 1n);
    let paymentTotal = 0n;

    for (const item of payment.snapshot.bill.items) {
      if (itemIds.has(item.id)) throw new TypeError('El reporte contiene ítems duplicados.');
      itemIds.add(item.id);
      const authorResult = userRefSchema.safeParse(itemAuthors.get(item.id));
      if (!authorResult.success) throw new TypeError('Falta un autor válido para el ítem.');
      const author = authorResult.data;
      const existingAuthor = authors.get(author.id);
      if (existingAuthor && existingAuthor.row.displayName !== author.displayName) {
        throw new TypeError('El nombre del autor no es coherente en el reporte.');
      }
      // Las cantidades de las cremas ya están resueltas para toda la línea en 014.
      let lineTotal = BigInt(item.quantity) * BigInt(item.priceCents);
      for (const sauce of item.sauces) {
        lineTotal = add(lineTotal, BigInt(sauce.quantity) * BigInt(sauce.priceCents));
      }
      safeNumber(lineTotal);
      paymentTotal = add(paymentTotal, lineTotal);
      const row: ProductSales = {
        productId: item.productId,
        productName: item.productName,
        productCategory: item.productCategory,
        portion: item.portion,
        cut: item.cut,
        quantity: 0,
        totalCents: 0,
      };
      const key = productKey(row);
      const product = products.get(key) ?? { row, total: 0n, quantity: 0n };
      product.total = add(product.total, lineTotal);
      product.quantity = add(product.quantity, BigInt(item.quantity));
      products.set(key, product);
      const authorGroup = existingAuthor ?? {
        row: { userId: author.id, displayName: author.displayName, totalCents: 0 },
        total: 0n,
      };
      authorGroup.total = add(authorGroup.total, lineTotal);
      authors.set(author.id, authorGroup);
    }
    if (paymentTotal !== amount) throw new TypeError('Los ítems no concilian con el pago.');
  }

  const report: DailySalesReport = {
    date,
    timeZone: TIME_ZONE,
    generatedAt,
    totalCents: safeNumber(total),
    paymentCount: safeNumber(count),
    methods: methods.map((row) => ({
      method: row.method,
      totalCents: safeNumber(row.total),
      paymentCount: safeNumber(row.count),
    })),
    hours: hours.map((row) => ({
      hour: row.hour,
      totalCents: safeNumber(row.total),
      paymentCount: safeNumber(row.count),
    })),
    products: [...products.values()]
      .map(({ row, total, quantity }) => ({
        ...row,
        totalCents: safeNumber(total),
        quantity: safeNumber(quantity),
      }))
      .sort(compareProducts),
    authors: [...authors.values()]
      .map(({ row, total }) => ({
        ...row,
        totalCents: safeNumber(total),
      }))
      .sort(compareAuthors),
  };
  if (!dailySalesReportSchema.safeParse(report).success) {
    throw new TypeError('Los datos del reporte no concilian.');
  }
  return report;
}
