import { createHash } from 'node:crypto';
import { QueryTypes, Transaction } from 'sequelize';
import {
  createPaymentResponseSchema,
  hasAnyRole,
  idempotencyKeySchema,
  paymentRequestSchema,
  paymentSchema,
  paymentSnapshotSchema,
} from '@polleria/shared';
import type { Bill, CreatePaymentResponse, Payment, UserRole } from '@polleria/shared';
import { AppError } from '../../errors/app-error.ts';
import type { Models, OrderModel, PaymentModel } from '../../models/index.ts';
import { loadOrderViews } from '../orders/order-view.ts';
import {
  createForbiddenError,
  createOrderNotFoundError,
  createOrderNotOpenError,
} from '../orders/order.service.ts';
import { createIdempotencyConflictError } from '../order-items/order-item.service.ts';
import { buildBill } from './bill.ts';

export interface PaymentActor {
  userId: number;
}
export interface PaymentService {
  getBill(orderId: number, actor: PaymentActor): Promise<Bill>;
  createPayment(
    orderId: number,
    body: unknown,
    key: string,
    actor: PaymentActor,
  ): Promise<CreatePaymentResponse>;
  getPayment(paymentId: number, actor: PaymentActor): Promise<Payment>;
}
interface PaymentServiceDeps {
  models: Models;
  now?: () => Date;
}
export type createPaymentService = (deps: PaymentServiceDeps) => PaymentService;

function paymentError(code: string, message: string, httpStatus = 409): AppError {
  return new AppError({ code, message, httpStatus });
}

/** El snapshot, y no las referencias actuales, conserva el cajero y la cuenta histórica. */
function toPayment(row: PaymentModel): Payment {
  return paymentSchema.parse({
    id: row.id,
    orderId: row.orderId,
    method: row.method,
    amountCents: row.amountCents,
    receivedCents: row.receivedCents,
    changeCents: row.changeCents,
    cashier: row.snapshot.cashier,
    paidAt: row.paidAt.toISOString(),
    snapshot: row.snapshot,
  });
}

export function createPaymentService({
  models,
  now = () => new Date(),
}: PaymentServiceDeps): PaymentService {
  const sequelize = models.Order.sequelize;
  if (sequelize === undefined)
    throw new Error('Los modelos no están vinculados a una conexión de Sequelize.');

  async function authorizedUser(actor: PaymentActor, roles: UserRole[], transaction: Transaction) {
    const user = await models.User.findByPk(actor.userId, { transaction });
    if (user === null || !user.isActive || !hasAnyRole(user.roles, roles))
      throw createForbiddenError();
    return user;
  }

  async function viewOf(row: OrderModel, transaction: Transaction) {
    const views = await loadOrderViews(models, [row], { transaction });
    const view = views.get(row.id);
    if (view === undefined) throw new Error('No se pudo leer el pedido.');
    return view;
  }

  return {
    async getBill(orderId, actor) {
      return sequelize.transaction(
        { isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ },
        async (transaction) => {
          await authorizedUser(actor, ['waiter', 'cashier', 'admin'], transaction);
          const row = await models.Order.findByPk(orderId, { transaction });
          if (row === null) throw createOrderNotFoundError();
          if (row.status !== 'open') throw createOrderNotOpenError();
          return buildBill(await viewOf(row, transaction), now().toISOString());
        },
      );
    },

    async createPayment(orderId, body, key, actor) {
      const request = paymentRequestSchema.parse(body);
      idempotencyKeySchema.parse(key);
      // Zod devuelve las claves en el orden fijo del esquema, sin depender del JSON de entrada.
      const requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
      return sequelize.transaction(async (transaction) => {
        const cashier = await authorizedUser(actor, ['cashier', 'admin'], transaction);
        let inserted: { id: number } | undefined;
        try {
          [inserted] = await sequelize.query<{ id: number }>(
            'INSERT INTO idempotency_keys (scope, key, order_id, request_hash, response_status, response_body, created_at) ' +
              "VALUES ('order_payment', :key, :orderId, :requestHash, 0, '{}'::jsonb, now()) " +
              'ON CONFLICT (scope, key) DO NOTHING RETURNING id',
            { replacements: { key, orderId, requestHash }, type: QueryTypes.SELECT, transaction },
          );
        } catch (error) {
          const constraint = (error as { parent?: { constraint?: string } } | null)?.parent
            ?.constraint;
          if (constraint === 'idempotency_keys_order_id_fkey') throw createOrderNotFoundError();
          throw error;
        }
        if (inserted === undefined) {
          const [stored] = await sequelize.query<{
            order_id: number;
            request_hash: string;
            response_body: unknown;
          }>(
            'SELECT order_id, request_hash, response_body FROM idempotency_keys ' +
              "WHERE scope = 'order_payment' AND key = :key FOR NO KEY UPDATE",
            { replacements: { key }, type: QueryTypes.SELECT, transaction },
          );
          if (stored === undefined) throw new Error('La clave de idempotencia desapareció.');
          if (stored.order_id !== orderId || stored.request_hash !== requestHash)
            throw createIdempotencyConflictError();
          return createPaymentResponseSchema.parse(stored.response_body);
        }

        // Orden global de bloqueos: pedido y después todas sus mesas por id ascendente.
        const row = await models.Order.findByPk(orderId, {
          lock: Transaction.LOCK.NO_KEY_UPDATE,
          transaction,
        });
        if (row === null) throw createOrderNotFoundError();
        if (row.status !== 'open') throw createOrderNotOpenError();
        await models.Table.findAll({
          where: { currentOrderId: orderId },
          order: [['id', 'ASC']],
          lock: Transaction.LOCK.NO_KEY_UPDATE,
          transaction,
        });
        const paidAt = now();
        const bill = buildBill(await viewOf(row, transaction), paidAt.toISOString());
        if (bill.hasPendingVoids)
          throw paymentError(
            'PENDING_VOIDS',
            'Resuelve las anulaciones pendientes antes de cobrar.',
          );
        if (!bill.canPay)
          throw paymentError(
            'ORDER_NOT_PAYABLE',
            'Este pedido no tiene un total válido para cobrar.',
          );
        if (request.billToken !== bill.billToken)
          throw paymentError(
            'BILL_CHANGED',
            'La cuenta cambió. Revísala nuevamente antes de cobrar.',
          );
        if (request.method === 'cash' && request.receivedCents < bill.totalCents)
          throw paymentError('INSUFFICIENT_CASH', 'El efectivo recibido no cubre el total.', 422);
        if (request.method !== 'cash' && request.receivedCents !== bill.totalCents)
          throw new AppError({
            code: 'VALIDATION_ERROR',
            httpStatus: 400,
            message: 'El monto recibido debe coincidir con el total.',
            details: {
              issues: [
                {
                  path: 'receivedCents',
                  message: 'El monto recibido debe coincidir con el total.',
                },
              ],
            },
          });
        const snapshot = paymentSnapshotSchema.parse({
          version: 1,
          bill,
          cashier: { id: cashier.id, displayName: cashier.displayName },
          method: request.method,
          amountCents: bill.totalCents,
          receivedCents: request.receivedCents,
          changeCents: request.receivedCents - bill.totalCents,
          paidAt: paidAt.toISOString(),
        });
        const paymentRow = await models.Payment.create(
          {
            orderId,
            method: snapshot.method,
            amountCents: snapshot.amountCents,
            receivedCents: snapshot.receivedCents,
            changeCents: snapshot.changeCents,
            cashierUserId: cashier.id,
            paidAt,
            billToken: bill.billToken,
            snapshotVersion: snapshot.version,
            snapshot,
          },
          { transaction },
        );
        await row.update(
          { status: 'closed', closedAt: paidAt, closedByUserId: cashier.id },
          { transaction },
        );
        await models.Table.update(
          { currentOrderId: null },
          { where: { currentOrderId: orderId }, transaction },
        );
        const response = createPaymentResponseSchema.parse({
          order: await viewOf(row, transaction),
          payment: toPayment(paymentRow),
        });
        await sequelize.query(
          'UPDATE idempotency_keys SET response_status = 201, response_body = :body::jsonb ' +
            "WHERE scope = 'order_payment' AND key = :key",
          {
            replacements: { key, body: JSON.stringify(response) },
            type: QueryTypes.UPDATE,
            transaction,
          },
        );
        return response;
      });
    },

    async getPayment(paymentId, actor) {
      return sequelize.transaction(async (transaction) => {
        await authorizedUser(actor, ['cashier', 'admin'], transaction);
        const row = await models.Payment.findByPk(paymentId, { transaction });
        if (row === null) throw paymentError('PAYMENT_NOT_FOUND', 'Ese pago no existe.', 404);
        return toPayment(row);
      });
    },
  };
}
