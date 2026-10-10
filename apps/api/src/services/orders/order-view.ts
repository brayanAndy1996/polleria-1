import { Op } from 'sequelize';
import type { Transaction } from 'sequelize';
import type { Order, OrderItem, TableRef, UserRef } from '@polleria/shared';
import type { Models, OrderItemModel } from '../../models/index.ts';

/** Las columnas de la fila de orders que necesita la forma pública del pedido. */
export interface OrderRowShape {
  id: number;
  status: Order['status'];
  openedByUserId: number;
  openedAt: Date;
  readyAt: Date | null;
  billRequestedAt: Date | null;
  closedAt: Date | null;
  closedByUserId: number | null;
  cancelReason: string | null;
  mergedIntoOrderId: number | null;
}

function toIsoOrNull(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

function toIso(value: Date): string {
  return value.toISOString();
}

/** La FK a users hace imposible un autor ausente; este rastro cubre una fila rota por SQL directo. */
const UNKNOWN_USER: Pick<UserRef, 'displayName'> = { displayName: '?' };

/**
 * Forma pública del pedido (D-009-14): las once claves exactas — mesas que lo cubren
 * como {id, name}, openedBy/closedBy como {id, displayName} y todas las marcas en
 * fecha ISO o null para que la interfaz las vea aunque el estado derivado elija una.
 */
export function toOrder(
  row: OrderRowShape,
  tables: TableRef[],
  openedBy: UserRef,
  closedBy: UserRef | null,
  items: OrderItem[],
): Order {
  // totalCents (D-010-03): suma de los ítems activos —'sent' y 'void_requested',
  // un ítem con solicitud pendiente sigue cobrándose hasta que se anula— con las
  // cremas de cada uno. Los 'voided' no cuentan.
  let totalCents = 0;
  for (const item of items) {
    if (item.status === 'voided') continue;
    totalCents += item.quantity * item.priceCents;
    for (const sauce of item.sauces) totalCents += sauce.quantity * sauce.priceCents;
  }
  return {
    id: row.id,
    status: row.status,
    tables,
    openedBy,
    openedAt: row.openedAt.toISOString(),
    readyAt: toIsoOrNull(row.readyAt),
    billRequestedAt: toIsoOrNull(row.billRequestedAt),
    closedAt: toIsoOrNull(row.closedAt),
    closedBy,
    cancelReason: row.cancelReason,
    mergedIntoOrderId: row.mergedIntoOrderId,
    items,
    totalCents,
  };
}

/**
 * Convierte filas de order_items a la forma pública del ítem EN LOTE (D-010-03):
 * una consulta por las cremas, otra por los componentes, otra por los usuarios
 * referenciados (enviado/pedido anular/anulado por) y otra por las mesas de
 * origen — nunca una consulta por ítem, igual que loadOrderViews con los pedidos.
 */
export async function toOrderItems(
  models: Models,
  rows: readonly OrderItemModel[],
  options: { transaction?: Transaction } = {},
): Promise<OrderItem[]> {
  if (rows.length === 0) return [];
  const itemIds = rows.map((row) => row.id);
  const [sauces, components] = await Promise.all([
    models.OrderItemSauce.findAll({
      where: { orderItemId: { [Op.in]: itemIds } },
      transaction: options.transaction,
    }),
    models.OrderItemComponent.findAll({
      where: { orderItemId: { [Op.in]: itemIds } },
      transaction: options.transaction,
    }),
  ]);
  const saucesByItem = new Map<number, typeof sauces>();
  for (const sauce of sauces) {
    const list = saucesByItem.get(sauce.orderItemId) ?? [];
    list.push(sauce);
    saucesByItem.set(sauce.orderItemId, list);
  }
  const componentsByItem = new Map<number, typeof components>();
  for (const component of components) {
    const list = componentsByItem.get(component.orderItemId) ?? [];
    list.push(component);
    componentsByItem.set(component.orderItemId, list);
  }

  const userIds = new Set<number>();
  const tableIds = new Set<number>();
  for (const row of rows) {
    userIds.add(row.createdByUserId);
    if (row.voidRequestedByUserId !== null) userIds.add(row.voidRequestedByUserId);
    if (row.voidedByUserId !== null) userIds.add(row.voidedByUserId);
    if (row.orderedAtTableId !== null) tableIds.add(row.orderedAtTableId);
  }
  const [users, tables] = await Promise.all([
    models.User.findAll({
      where: { id: { [Op.in]: [...userIds] } },
      attributes: ['id', 'displayName'],
      transaction: options.transaction,
    }),
    tableIds.size === 0
      ? Promise.resolve([])
      : models.Table.findAll({
          where: { id: { [Op.in]: [...tableIds] } },
          attributes: ['id', 'name'],
          transaction: options.transaction,
        }),
  ]);
  const usersById = new Map<number, UserRef>(
    users.map((user) => [user.id, { id: user.id, displayName: user.displayName }]),
  );
  const tablesById = new Map<number, TableRef>(
    tables.map((table) => [table.id, { id: table.id, name: table.name }]),
  );
  const userRef = (id: number | null): UserRef | null =>
    id === null ? null : (usersById.get(id) ?? { id, displayName: '?' });

  return [...rows]
    .sort((first, second) => first.id - second.id)
    .map((row) => ({
      id: row.id,
      productId: row.productId,
      productName: row.productName,
      productCategory: row.productCategory,
      quantity: row.quantity,
      priceCents: row.priceCents,
      portion: row.portion,
      cut: row.cut,
      breastEighths: row.breastEighths,
      legEighths: row.legEighths,
      notes: row.notes,
      sauces: (saucesByItem.get(row.id) ?? [])
        .sort((first, second) => first.id - second.id)
        .map((sauce) => ({
          productId: sauce.productId,
          productName: sauce.productName,
          quantity: sauce.quantity,
          priceCents: sauce.priceCents,
        })),
      components: (componentsByItem.get(row.id) ?? [])
        .sort((first, second) => first.id - second.id)
        .map((component) => ({
          productId: component.productId,
          productName: component.productName,
          quantity: component.quantity,
          portion: component.portion,
          cut: component.cut,
          breastEighths: component.breastEighths,
          legEighths: component.legEighths,
        })),
      status: row.status,
      kitchenTicketId: row.kitchenTicketId,
      voidTicketId: row.voidTicketId,
      voidedBy: userRef(row.voidedByUserId),
      voidedAt: toIsoOrNull(row.voidedAt),
      voidReason: row.voidReason,
      voidRequestedBy: userRef(row.voidRequestedByUserId),
      voidRequestedAt: toIsoOrNull(row.voidRequestedAt),
      voidRequestReason: row.voidRequestReason,
      orderedAtTable:
        row.orderedAtTableId === null
          ? null
          : (tablesById.get(row.orderedAtTableId) ?? { id: row.orderedAtTableId, name: '?' }),
      createdBy: userRef(row.createdByUserId) ?? {
        id: row.createdByUserId,
        displayName: '?',
      },
      createdAt: toIso(row.createdAt),
    }));
}

/**
 * Convierte filas de orders a la forma pública EN LOTE: una sola consulta por las
 * mesas que los cubren y otra por los usuarios referenciados (abierto/cerrado por),
 * nunca una consulta por pedido — el listado del salón embebe varios pedidos y el
 * N+1 está medido en las pruebas (RN-009-01). Order.tables sale ordenado por id de
 * mesa: estable y fácil de leer en el tablero.
 */
export async function loadOrderViews(
  models: Models,
  rows: readonly OrderRowShape[],
  options: { transaction?: Transaction } = {},
): Promise<Map<number, Order>> {
  const views = new Map<number, Order>();
  if (rows.length === 0) return views;

  const orderIds = rows.map((row) => row.id);
  const covering = await models.Table.findAll({
    where: { currentOrderId: { [Op.in]: orderIds } },
    attributes: ['id', 'name', 'currentOrderId'],
    transaction: options.transaction,
  });
  const tablesByOrder = new Map<number, TableRef[]>();
  for (const table of [...covering].sort((first, second) => first.id - second.id)) {
    if (table.currentOrderId === null) continue;
    const list = tablesByOrder.get(table.currentOrderId) ?? [];
    list.push({ id: table.id, name: table.name });
    tablesByOrder.set(table.currentOrderId, list);
  }

  const userIds = new Set<number>();
  for (const row of rows) {
    userIds.add(row.openedByUserId);
    if (row.closedByUserId !== null) userIds.add(row.closedByUserId);
  }
  const users = await models.User.findAll({
    where: { id: { [Op.in]: [...userIds] } },
    attributes: ['id', 'displayName'],
    transaction: options.transaction,
  });
  const usersById = new Map<number, UserRef>(
    users.map((user) => [user.id, { id: user.id, displayName: user.displayName }]),
  );

  // Los ítems de todos los pedidos del lote, agrupados por pedido (D-010-03:
  // la vista del pedido embebe la lista completa — enviados, solicitados y
  // anulados — en orden de id).
  const itemRows = await models.OrderItem.findAll({
    where: { orderId: { [Op.in]: orderIds } },
    transaction: options.transaction,
  });
  const itemViews = await toOrderItems(models, itemRows, { transaction: options.transaction });
  const orderIdByItem = new Map(itemRows.map((row) => [row.id, row.orderId]));
  const itemsByOrder = new Map<number, OrderItem[]>();
  for (const item of itemViews) {
    const orderId = orderIdByItem.get(item.id);
    if (orderId === undefined) continue;
    const list = itemsByOrder.get(orderId) ?? [];
    list.push(item);
    itemsByOrder.set(orderId, list);
  }

  for (const row of rows) {
    const openedBy = usersById.get(row.openedByUserId) ?? {
      id: row.openedByUserId,
      ...UNKNOWN_USER,
    };
    const closedBy =
      row.closedByUserId === null
        ? null
        : (usersById.get(row.closedByUserId) ?? { id: row.closedByUserId, ...UNKNOWN_USER });
    views.set(
      row.id,
      toOrder(
        row,
        tablesByOrder.get(row.id) ?? [],
        openedBy,
        closedBy,
        itemsByOrder.get(row.id) ?? [],
      ),
    );
  }
  return views;
}
