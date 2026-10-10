import { Op, Transaction } from 'sequelize';
import { cancelReasonSchema, ERROR_CODES } from '@polleria/shared';
import type { Order } from '@polleria/shared';
import { AppError } from '../../errors/app-error.ts';
import type { Models, OrderModel, TableModel } from '../../models/index.ts';
import {
  createTableHasNoOrderError,
  createTableInactiveError,
  createTableNotFoundError,
  createTableOccupiedError,
} from '../tables/table.service.ts';
import { loadOrderViews } from './order-view.ts';

/** El usuario de la sesión que ejecuta la operación: siempre viene de requireAuth. */
export interface OrderActor {
  userId: number;
}

export interface OrderService {
  openOrder(tableId: number, actor: OrderActor): Promise<Order>;
  getOrder(orderId: number): Promise<Order>;
  moveOrder(orderId: number, tableId: number, actor: OrderActor): Promise<Order>;
  joinTable(tableId: number, intoTableId: number, actor: OrderActor): Promise<Order>;
  leaveTable(tableId: number, actor: OrderActor): Promise<Order>;
  requestBill(orderId: number, actor: OrderActor): Promise<Order>;
  markReady(orderId: number, actor: OrderActor): Promise<Order>;
  markServed(orderId: number, actor: OrderActor): Promise<Order>;
  cancelOrder(orderId: number, reason: unknown, actor: OrderActor): Promise<Order>;
}

export function createOrderNotFoundError(): AppError {
  return new AppError({
    code: 'ORDER_NOT_FOUND',
    message: 'Ese pedido no existe.',
    httpStatus: 404,
  });
}
export function createOrderNotOpenError(): AppError {
  return new AppError({
    code: 'ORDER_NOT_OPEN',
    message: 'El pedido ya está cerrado.',
    httpStatus: 409,
  });
}
export function createOrderNeedsTableError(): AppError {
  return new AppError({
    code: 'ORDER_NEEDS_TABLE',
    message: 'El pedido necesita al menos una mesa; cancélalo o ciérralo.',
    httpStatus: 409,
  });
}

/** Dato inválido de un cuerpo de salón: VALIDATION_ERROR con un solo issue (D-009-13). */
function validationIssue(path: string, message: string): AppError {
  return new AppError({
    code: ERROR_CODES.VALIDATION_ERROR,
    message: 'Los datos enviados no son válidos.',
    httpStatus: 400,
    details: { issues: [{ path, message }] },
  });
}

/**
 * La premisa de una operación cambió entre la lectura inicial y los bloqueos: un
 * puntero de mesa ahora apunta a un pedido que esta transacción no bloqueó y el
 * orden de bloqueo (pedidos por id y luego mesas por id) no permite tomarlo aquí.
 * Se aborta y la operación reintenta con la foto nueva.
 */
class PremiseChangedError extends Error {}

/** Intentos máximos de una operación con re-lectura de premisa; agotarlos es un 500. */
const PREMISE_RETRIES = 5;

/**
 * Servicio del ciclo de vida del pedido (spec 009, D-009-06 y sección 7). Toda
 * operación corre en una transacción y bloquea con FOR NO KEY UPDATE —nunca FOR
 * UPDATE: las FK hacia users/orders dejan FOR KEY SHARE sobre las filas del pedido
 * y FOR UPDATE chocaría con ellas (lección de la 006). El orden de bloqueo es
 * siempre el mismo: primero las filas de orders por id y después las de tables por
 * id, así dos operaciones concurrentes nunca se esperan en círculo.
 *
 * Invariante que mantiene este orden: mientras una transacción tiene bloqueado un
 * pedido, el conjunto de mesas que lo cubren está congelado — repuntar una mesa a
 * ese pedido o sacarla de él exige antes el bloqueo del propio pedido (join, leave,
 * move y cancel lo hacen; openOrder solo toca mesas libres). Por eso basta leer las
 * mesas cubridoras después del bloqueo del pedido para tener el conjunto exacto.
 */
export function createOrderService({ models }: { models: Models }): OrderService {
  const sequelize = models.Order.sequelize;
  if (sequelize === undefined)
    throw new Error('Los modelos no están vinculados a una conexión de Sequelize.');
  const now = () => new Date();

  /** La forma pública de una fila de pedido dentro de la transacción activa. */
  async function viewOf(orderId: number, transaction: Transaction): Promise<Order> {
    const row = await models.Order.findByPk(orderId, { transaction });
    if (row === null) throw createOrderNotFoundError();
    const views = await loadOrderViews(models, [row], { transaction });
    const view = views.get(orderId);
    if (view === undefined) throw new Error(`No se pudo armar la vista del pedido ${orderId}.`);
    return view;
  }

  /** La fila del pedido bloqueada y verificada abierta dentro de la transacción. */
  async function openOrderRow(orderId: number, transaction: Transaction): Promise<OrderModel> {
    const order = await models.Order.findByPk(orderId, {
      lock: Transaction.LOCK.NO_KEY_UPDATE,
      transaction,
    });
    if (order === null) throw createOrderNotFoundError();
    if (order.status !== 'open') throw createOrderNotOpenError();
    return order;
  }

  /** Mesas bloqueadas por id en orden ascendente, dentro de la transacción. */
  async function lockedTables(ids: number[], transaction: Transaction): Promise<TableModel[]> {
    if (ids.length === 0) return [];
    return models.Table.findAll({
      where: { id: { [Op.in]: ids } },
      order: [['id', 'ASC']],
      lock: Transaction.LOCK.NO_KEY_UPDATE,
      transaction,
    });
  }

  /** Pedidos bloqueados por id en orden ascendente, dentro de la transacción. */
  async function lockedOrders(ids: number[], transaction: Transaction): Promise<OrderModel[]> {
    if (ids.length === 0) return [];
    return models.Order.findAll({
      where: { id: { [Op.in]: ids } },
      order: [['id', 'ASC']],
      lock: Transaction.LOCK.NO_KEY_UPDATE,
      transaction,
    });
  }

  /** Ids de las mesas que cubren el pedido, leídos ya bloqueado el pedido (conjunto congelado). */
  async function coveringTableIds(orderId: number, transaction: Transaction): Promise<number[]> {
    const rows = await models.Table.findAll({
      where: { currentOrderId: orderId },
      attributes: ['id'],
      transaction,
    });
    return rows.map((row) => row.id).sort((first, second) => first - second);
  }

  return {
    async openOrder(tableId, actor) {
      return sequelize.transaction(async (transaction) => {
        // La fila de la mesa serializa la apertura (D-009-06): dos openOrder sobre la
        // misma mesa esperan aquí y el perdedor la relee ya ocupada.
        const table = await models.Table.findByPk(tableId, {
          attributes: ['id', 'name', 'isActive', 'currentOrderId'],
          lock: Transaction.LOCK.NO_KEY_UPDATE,
          transaction,
        });
        if (table === null) throw createTableNotFoundError();
        if (!table.isActive) throw createTableInactiveError();
        if (table.currentOrderId !== null) throw createTableOccupiedError();
        const order = await models.Order.create(
          { openedByUserId: actor.userId },
          { transaction },
        );
        // La ocupación es el UPDATE condicional atómico de D-009-02: solo se toma
        // una mesa libre. Cero filas afectadas = la mesa quedó ocupada — aunque con
        // el bloqueo de fila es inalcanzable, es la guardia que manda la spec.
        const [affected] = await models.Table.update(
          { currentOrderId: order.id },
          { where: { id: tableId, currentOrderId: null }, transaction },
        );
        if (affected === 0) throw createTableOccupiedError();
        return viewOf(order.id, transaction);
      });
    },

    async getOrder(orderId) {
      const row = await models.Order.findByPk(orderId);
      if (row === null) throw createOrderNotFoundError();
      const views = await loadOrderViews(models, [row]);
      const view = views.get(orderId);
      if (view === undefined) throw new Error(`No se pudo armar la vista del pedido ${orderId}.`);
      return view;
    },

    async moveOrder(orderId, tableId, actor) {
      // El movimiento no registra actor (D-009-07); la firma es uniforme con las
      // demás operaciones del pedido (spec 009, §11).
      void actor;
      return sequelize.transaction(async (transaction) => {
        await openOrderRow(orderId, transaction);
        // El conjunto cubridor queda congelado por el bloqueo del pedido.
        const covered = await coveringTableIds(orderId, transaction);
        const targetIds = [...new Set([...covered, tableId])];
        const locked = await lockedTables(targetIds, transaction);
        const destination = locked.find((table) => table.id === tableId);
        // El destino es dato del cuerpo: su inexistencia es un issue, no un 404.
        if (destination === undefined)
          throw validationIssue('tableId', 'Esa mesa no existe.');
        if (!destination.isActive) throw createTableInactiveError();
        // Ya cubre sola: mover es un no-op (D-009-07).
        if (covered.length === 1 && covered[0] === tableId)
          return viewOf(orderId, transaction);
        if (destination.currentOrderId === null) {
          const [affected] = await models.Table.update(
            { currentOrderId: orderId },
            { where: { id: tableId, currentOrderId: null }, transaction },
          );
          if (affected === 0) throw createTableOccupiedError();
        } else if (destination.currentOrderId !== orderId) {
          throw createTableOccupiedError();
        }
        // Liberar las otras mesas del pedido: el pedido completo se mueve (D-009-07).
        await models.Table.update(
          { currentOrderId: null },
          { where: { currentOrderId: orderId, id: { [Op.ne]: tableId } }, transaction },
        );
        return viewOf(orderId, transaction);
      });
    },

    async joinTable(tableId, intoTableId, actor) {
      for (let attempt = 0; attempt <= PREMISE_RETRIES; attempt += 1) {
        // Las guardias de la mesa de la ruta responden su código y las del cuerpo
        // salen como issues (D-009-08, D-009-13); se re-evalúan en cada intento.
        const origin = await models.Table.findByPk(tableId, {
          attributes: ['id', 'isActive', 'currentOrderId'],
        });
        if (origin === null) throw createTableNotFoundError();
        if (!origin.isActive) throw createTableInactiveError();
        if (intoTableId === tableId)
          throw validationIssue('intoTableId', 'La mesa de destino debe ser otra.');
        const destination = await models.Table.findByPk(intoTableId, {
          attributes: ['id', 'isActive', 'currentOrderId'],
        });
        if (destination === null)
          throw validationIssue('intoTableId', 'Esa mesa no existe.');
        if (!destination.isActive) throw createTableInactiveError();
        const involvedIds = [
          ...new Set(
            [origin.currentOrderId, destination.currentOrderId].filter(
              (orderId): orderId is number => orderId !== null,
            ),
          ),
        ].sort((first, second) => first - second);
        try {
          return await sequelize.transaction(async (transaction) => {
            const orders = await lockedOrders(involvedIds, transaction);
            const ordersById = new Map(orders.map((order) => [order.id, order]));
            // El bloqueo devuelve las filas por id; se localizan por su id, nunca por
            // posición, porque la mesa destino puede tener un id menor que la origen.
            const pair = await lockedTables([tableId, intoTableId], transaction);
            const lockedOrigin = pair.find((row) => row.id === tableId);
            const lockedDestination = pair.find((row) => row.id === intoTableId);
            if (lockedOrigin === undefined || lockedDestination === undefined)
              throw new PremiseChangedError();
            // Re-verificación ya bloqueadas las filas: los punteros de estas dos
            // mesas no pueden moverse mientras dure la transacción.
            if (!lockedOrigin.isActive) throw createTableInactiveError();
            if (!lockedDestination.isActive) throw createTableInactiveError();
            const originOrderId = lockedOrigin.currentOrderId;
            const destinationOrderId = lockedDestination.currentOrderId;
            // Un puntero nuevo a un pedido que no bloqueamos: abortar y reintentar.
            if (
              (originOrderId !== null && !ordersById.has(originOrderId)) ||
              (destinationOrderId !== null && !ordersById.has(destinationOrderId))
            )
              throw new PremiseChangedError();
            const destinationOrder =
              destinationOrderId === null ? null : (ordersById.get(destinationOrderId) ?? null);
            if (destinationOrder === null || destinationOrder.status !== 'open')
              throw createTableHasNoOrderError();
            const targetOrderId = destinationOrder.id;
            // Mismo pedido en ambas mesas: unir es un no-op.
            if (originOrderId === destinationOrderId)
              return viewOf(targetOrderId, transaction);
            if (originOrderId === null) {
              // Mesa origen libre: se suma a la cuenta del destino.
              await lockedOrigin.update({ currentOrderId: targetOrderId }, { transaction });
              return viewOf(targetOrderId, transaction);
            }
            const originOrder = ordersById.get(originOrderId);
            if (originOrder !== undefined && originOrder.status === 'open') {
              // Merge (D-009-08): todas las mesas del pedido origen pasan al pedido
              // destino y el origen queda 'merged' con su cierre registrado; las
              // marcas del destino se conservan (RN-009-05). El conjunto del origen
              // está congelado por su bloqueo, así que el UPDATE lo cubre completo.
              await models.Table.update(
                { currentOrderId: targetOrderId },
                { where: { currentOrderId: originOrderId }, transaction },
              );
              await originOrder.update(
                {
                  status: 'merged',
                  mergedIntoOrderId: targetOrderId,
                  closedAt: now(),
                  closedByUserId: actor.userId,
                },
                { transaction },
              );
              return viewOf(targetOrderId, transaction);
            }
            // Puntero a un pedido ya no abierto: la mesa origen cuenta como libre.
            await lockedOrigin.update({ currentOrderId: targetOrderId }, { transaction });
            return viewOf(targetOrderId, transaction);
          });
        } catch (error) {
          if (error instanceof PremiseChangedError && attempt < PREMISE_RETRIES) continue;
          throw error;
        }
      }
      throw new PremiseChangedError();
    },

    async leaveTable(tableId, actor) {
      // Separar no registra actor (D-009-09); firma uniforme con las demás (§11).
      void actor;
      for (let attempt = 0; attempt <= PREMISE_RETRIES; attempt += 1) {
        const table = await models.Table.findByPk(tableId, {
          attributes: ['id', 'currentOrderId'],
        });
        if (table === null) throw createTableNotFoundError();
        const orderId = table.currentOrderId;
        if (orderId === null) throw createTableHasNoOrderError();
        try {
          return await sequelize.transaction(async (transaction) => {
            // Pedido primero, mesa después: el orden de bloqueo de la casa.
            const order = await models.Order.findByPk(orderId, {
              attributes: ['id', 'status'],
              lock: Transaction.LOCK.NO_KEY_UPDATE,
              transaction,
            });
            // Puntero a un pedido que ya no está abierto = mesa sin pedido abierto.
            if (order === null || order.status !== 'open') throw createTableHasNoOrderError();
            const [lockedTable] = await lockedTables([tableId], transaction);
            const pointer = lockedTable?.currentOrderId ?? null;
            if (pointer === null) throw createTableHasNoOrderError();
            if (pointer !== orderId) throw new PremiseChangedError();
            // El conjunto cubridor está congelado por el bloqueo del pedido.
            const covered = await coveringTableIds(orderId, transaction);
            // Separar la última mesa dejaría un pedido de salón sin mesa (RN-009-07):
            // el camino es cancelarlo o — en Fase 4 — cobrarlo.
            if (covered.length === 1) throw createOrderNeedsTableError();
            await lockedTables(covered, transaction);
            await models.Table.update(
              { currentOrderId: null },
              { where: { id: tableId, currentOrderId: orderId }, transaction },
            );
            return viewOf(orderId, transaction);
          });
        } catch (error) {
          if (error instanceof PremiseChangedError && attempt < PREMISE_RETRIES) continue;
          throw error;
        }
      }
      throw new PremiseChangedError();
    },

    async requestBill(orderId, actor) {
      return sequelize.transaction(async (transaction) => {
        const order = await openOrderRow(orderId, transaction);
        // Idempotente (D-009-10): la primera marca se conserva y repetir es no-op.
        if (order.billRequestedAt === null)
          await order.update(
            { billRequestedAt: now(), billRequestedByUserId: actor.userId },
            { transaction },
          );
        return viewOf(orderId, transaction);
      });
    },

    async markReady(orderId, actor) {
      return sequelize.transaction(async (transaction) => {
        const order = await openOrderRow(orderId, transaction);
        if (order.readyAt === null)
          await order.update(
            { readyAt: now(), readyByUserId: actor.userId },
            { transaction },
          );
        return viewOf(orderId, transaction);
      });
    },

    async markServed(orderId, actor) {
      // Servir limpia la marca sin registrar quién la quita (D-009-10); firma uniforme.
      void actor;
      return sequelize.transaction(async (transaction) => {
        const order = await openOrderRow(orderId, transaction);
        // Se sirvió: solo se limpia el par de listo; la cuenta pedida se conserva
        // (D-009-10). Si ya estaba limpio es un no-op.
        if (order.readyAt !== null)
          await order.update({ readyAt: null, readyByUserId: null }, { transaction });
        return viewOf(orderId, transaction);
      });
    },

    async cancelOrder(orderId, reason, actor) {
      // El motivo se valida con el esquema antes de tocar la base (AC-14): recorte,
      // largo 1..200 — un ZodError no debe abrir transacción.
      const cancelReason = cancelReasonSchema.parse(reason);
      return sequelize.transaction(async (transaction) => {
        const order = await openOrderRow(orderId, transaction);
        // Con el pedido bloqueado su conjunto de mesas está congelado: se bloquean
        // por id y se liberan todas en la misma transacción (RN-009-04/RN-009-08).
        const covered = await coveringTableIds(orderId, transaction);
        await lockedTables(covered, transaction);
        await models.Table.update(
          { currentOrderId: null },
          { where: { currentOrderId: orderId }, transaction },
        );
        await order.update(
          {
            status: 'cancelled',
            cancelReason,
            closedAt: now(),
            closedByUserId: actor.userId,
          },
          { transaction },
        );
        return viewOf(orderId, transaction);
      });
    },
  };
}
