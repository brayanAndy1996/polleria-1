import { Op, Transaction, UniqueConstraintError } from 'sequelize';
import { createTableRequestSchema, updateTableRequestSchema } from '@polleria/shared';
import type { Order, Table, TableState } from '@polleria/shared';
import { AppError } from '../../errors/app-error.ts';
import type { Models } from '../../models/index.ts';
import { loadOrderViews } from '../orders/order-view.ts';

export interface TableService {
  listTables(): Promise<Table[]>;
  createTable(input: unknown): Promise<Table>;
  updateTable(tableId: number, input: unknown): Promise<Table>;
}

export function createTableNotFoundError(): AppError {
  return new AppError({
    code: 'TABLE_NOT_FOUND',
    message: 'Esa mesa no existe.',
    httpStatus: 404,
  });
}
export function createTableNameTakenError(): AppError {
  return new AppError({
    code: 'TABLE_NAME_TAKEN',
    message: 'Ya existe una mesa con ese nombre.',
    httpStatus: 409,
  });
}
export function createTableOccupiedError(): AppError {
  return new AppError({
    code: 'TABLE_OCCUPIED',
    message: 'La mesa ya tiene un pedido abierto.',
    httpStatus: 409,
  });
}
export function createTableInactiveError(): AppError {
  return new AppError({
    code: 'TABLE_INACTIVE',
    message: 'La mesa está desactivada.',
    httpStatus: 409,
  });
}
export function createTableHasOpenOrderError(): AppError {
  return new AppError({
    code: 'TABLE_HAS_OPEN_ORDER',
    message: 'La mesa tiene un pedido abierto; ciérralo o muévelo antes de desactivarla.',
    httpStatus: 409,
  });
}
export function createTableHasNoOrderError(): AppError {
  return new AppError({
    code: 'TABLE_HAS_NO_ORDER',
    message: 'La mesa no tiene un pedido abierto.',
    httpStatus: 409,
  });
}

/**
 * El estado del salón se deriva del pedido que cubre la mesa (RF-02, D-009-03):
 * precedencia fija ready > bill_requested > occupied y sin pedido, free. Las dos
 * señales conviven en la respuesta; el estado solo elige cuál dibuja el tablero.
 */
export function deriveTableState(
  order: Pick<Order, 'readyAt' | 'billRequestedAt'> | null,
): TableState {
  if (order === null) return 'free';
  if (order.readyAt !== null) return 'ready';
  if (order.billRequestedAt !== null) return 'bill_requested';
  return 'occupied';
}

/** Las cinco claves exactas de la forma pública de la mesa (D-009-14). */
function toTable(row: { id: number; name: string; isActive: boolean }, order: Order | null): Table {
  return {
    id: row.id,
    name: row.name,
    isActive: row.isActive,
    state: deriveTableState(order),
    order,
  };
}

/**
 * Servicio del salón (spec 009). listTables devuelve TODAS las mesas —activas e
 * inactivas— en orden natural español con el pedido embebido compartido entre las
 * unidas, leído en lote (RN-009-01). createTable y updateTable traducen el índice
 * único lower(name) a TABLE_NAME_TAKEN; una mesa nunca se borra, se desactiva
 * (RN-009-09), y solo si está libre — la comprobación se hace con la fila
 * bloqueada (FOR NO KEY UPDATE) dentro de la transacción para que un openOrder
 * concurrente no la ocupe a mitad de vuelo.
 */
export function createTableService({ models }: { models: Models }): TableService {
  const sequelize = models.Table.sequelize;
  if (sequelize === undefined)
    throw new Error('Los modelos no están vinculados a una conexión de Sequelize.');

  // Orden natural del tablero (D-009-12): colación española insensible a
  // mayúsculas/tildes y numérica (Mesa 2 antes que Mesa 10); los empates, por id.
  const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

  /** Forma pública del pedido que cubre a la mesa, o null si está libre. */
  async function orderOf(orderId: number | null, transaction: Transaction): Promise<Order | null> {
    if (orderId === null) return null;
    const order = await models.Order.findByPk(orderId, { transaction });
    if (order === null) return null;
    const views = await loadOrderViews(models, [order], { transaction });
    return views.get(orderId) ?? null;
  }

  return {
    async listTables() {
      const rows = await models.Table.findAll({
        attributes: ['id', 'name', 'isActive', 'currentOrderId'],
      });
      const orderIds = [
        ...new Set(
          rows
            .map((row) => row.currentOrderId)
            .filter((orderId): orderId is number => orderId !== null),
        ),
      ];
      const orders =
        orderIds.length === 0
          ? []
          : await models.Order.findAll({ where: { id: { [Op.in]: orderIds } } });
      const views = await loadOrderViews(models, orders);
      return rows
        .map((row) =>
          toTable(
            row,
            row.currentOrderId === null ? null : (views.get(row.currentOrderId) ?? null),
          ),
        )
        .sort((first, second) => collator.compare(first.name, second.name) || first.id - second.id);
    },
    async createTable(input) {
      const { name } = createTableRequestSchema.parse(input);
      try {
        // Toda mesa nace activa y libre: is_active y current_order_id salen del
        // DEFAULT de la base; el índice único resuelve la carrera del mismo nombre.
        const created = await models.Table.create({ name });
        return toTable(created, null);
      } catch (error) {
        if (error instanceof UniqueConstraintError) throw createTableNameTakenError();
        throw error;
      }
    },
    async updateTable(tableId, input) {
      const changes = updateTableRequestSchema.parse(input);
      try {
        return await sequelize.transaction(async (transaction) => {
          const table = await models.Table.findByPk(tableId, {
            attributes: ['id', 'name', 'isActive', 'currentOrderId'],
            lock: Transaction.LOCK.NO_KEY_UPDATE,
            transaction,
          });
          if (table === null) throw createTableNotFoundError();
          // Solo se rechaza DESACTIVAR una mesa cubierta (RN-009-09): renombrarla o
          // reactivarla se permite tenga o no pedido. La fila quedó bloqueada, así
          // que ningún openOrder la puede ocupar a mitad de la operación.
          if (changes.isActive === false && table.currentOrderId !== null)
            throw createTableHasOpenOrderError();
          const updates: { name?: string; isActive?: boolean } = {};
          if (changes.name !== undefined) updates.name = changes.name;
          if (changes.isActive !== undefined) updates.isActive = changes.isActive;
          await table.update(updates, { transaction });
          return toTable(table, await orderOf(table.currentOrderId, transaction));
        });
      } catch (error) {
        // Renombrar al nombre de otra mesa —inactiva incluida— choca en el índice
        // único lower(name); al propio nombre con otras mayúsculas no (RN-009-09).
        if (error instanceof UniqueConstraintError) throw createTableNameTakenError();
        throw error;
      }
    },
  };
}
