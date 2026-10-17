import { createHash } from 'node:crypto';
import { PAYMENT_CENTS_MAX, type Bill, type BillItem, type Order } from '@polleria/shared';

/** Desempate determinista de detalles con el mismo producto, independiente del locale. */
function compareDetails<T extends { productId: number }>(left: T, right: T): number {
  const byProduct = left.productId - right.productId;
  if (byProduct !== 0) return byProduct;
  const a = JSON.stringify(left);
  const b = JSON.stringify(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Cuenta desde la vista consistente del pedido; no consulta carta ni modifica el origen. */
export function buildBill(order: Order, generatedAt: string): Bill {
  const tables = order.tables
    .map(({ id, name }) => ({ id, name }))
    .sort((left, right) => left.id - right.id);
  const items: BillItem[] = order.items
    .filter((item) => item.status !== 'voided')
    .map((item): BillItem => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      productCategory: item.productCategory,
      quantity: item.quantity,
      priceCents: item.priceCents,
      portion: item.portion,
      cut: item.cut,
      breastEighths: item.breastEighths,
      legEighths: item.legEighths,
      notes: item.notes,
      sauces: item.sauces
        .map(({ productId, productName, quantity, priceCents }) => ({
          productId,
          productName,
          quantity,
          priceCents,
        }))
        .sort(compareDetails),
      components: item.components
        .map(({ productId, productName, quantity, portion, cut, breastEighths, legEighths }) => ({
          productId,
          productName,
          quantity,
          portion,
          cut,
          breastEighths,
          legEighths,
        }))
        .sort(compareDetails),
      status: item.status as BillItem['status'],
    }))
    .sort((left, right) => left.id - right.id);

  const totalCents = items.reduce(
    (total, item) =>
      total +
      item.quantity * item.priceCents +
      item.sauces.reduce((sum, sauce) => sum + sauce.quantity * sauce.priceCents, 0),
    0,
  );
  const hasPendingVoids = items.some((item) => item.status === 'void_requested');
  // Solo contenido cobrable: las marcas operativas y la hora de lectura no invalidan la cuenta.
  const billToken = createHash('sha256')
    .update(JSON.stringify({ orderId: order.id, tables, items }))
    .digest('hex');
  return {
    orderId: order.id,
    tables,
    items,
    totalCents,
    hasPendingVoids,
    canPay:
      order.status === 'open' &&
      items.length > 0 &&
      totalCents > 0 &&
      totalCents <= PAYMENT_CENTS_MAX &&
      !hasPendingVoids,
    billToken,
    generatedAt,
  };
}
