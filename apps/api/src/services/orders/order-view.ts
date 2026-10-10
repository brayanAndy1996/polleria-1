import { Op } from 'sequelize';
import type { Transaction } from 'sequelize';
import type { Order, TableRef, UserRef } from '@polleria/shared';
import type { Models } from '../../models/index.ts';

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
): Order {
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
  };
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

  for (const row of rows) {
    const openedBy = usersById.get(row.openedByUserId) ?? {
      id: row.openedByUserId,
      ...UNKNOWN_USER,
    };
    const closedBy =
      row.closedByUserId === null
        ? null
        : (usersById.get(row.closedByUserId) ?? { id: row.closedByUserId, ...UNKNOWN_USER });
    views.set(row.id, toOrder(row, tablesByOrder.get(row.id) ?? [], openedBy, closedBy));
  }
  return views;
}
