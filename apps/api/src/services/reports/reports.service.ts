import { Op, Transaction, literal } from 'sequelize';
import {
  buildDailySalesReport,
  hasAnyRole,
  paymentSchema,
  paymentSnapshotSchema,
  salesDateSchema,
  toLimaDateTimeParts,
} from '@polleria/shared';
import type { DailySalesReport, Payment, UserRef } from '@polleria/shared';
import type { Models, PaymentModel } from '../../models/index.ts';
import { AppError } from '../../errors/app-error.ts';
import { createForbiddenError } from '../orders/order.service.ts';

export interface ReportsService {
  getDailySales(date: string | undefined, actor: { userId: number }): Promise<DailySalesReport>;
}

function invalidData(): AppError {
  return new AppError({
    code: 'REPORT_DATA_INVALID',
    httpStatus: 500,
    message: 'Los datos históricos no permiten generar el reporte.',
  });
}

function paymentView(row: PaymentModel): Payment {
  // Validar el JSON antes de acceder a sus propiedades: los registros antiguos pueden estar dañados.
  const snapshot = paymentSnapshotSchema.safeParse(row.snapshot);
  if (
    !snapshot.success ||
    !(row.paidAt instanceof Date) ||
    !Number.isFinite(row.paidAt.getTime()) ||
    row.cashierUserId !== snapshot.data.cashier.id ||
    row.billToken !== snapshot.data.bill.billToken ||
    row.snapshotVersion !== snapshot.data.version
  )
    throw invalidData();
  const payment = paymentSchema.safeParse({
    id: row.id,
    orderId: row.orderId,
    method: row.method,
    amountCents: row.amountCents,
    receivedCents: row.receivedCents,
    changeCents: row.changeCents,
    cashier: snapshot.data.cashier,
    paidAt: row.paidAt.toISOString(),
    snapshot: snapshot.data,
  });
  if (!payment.success) throw invalidData();
  return payment.data;
}

export function createReportsService({
  models,
  now = () => new Date(),
}: {
  models: Models;
  now?: () => Date;
}): ReportsService {
  const sequelize = models.Payment.sequelize;
  if (sequelize === undefined)
    throw new Error('Los modelos no están vinculados a una conexión de Sequelize.');

  return {
    async getDailySales(requestedDate, actor) {
      return sequelize.transaction(
        {
          isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ,
          readOnly: true,
        },
        async (transaction) => {
          const user = await models.User.findByPk(actor.userId, { transaction });
          if (user === null || !user.isActive || !hasAnyRole(user.roles, ['admin'])) {
            throw createForbiddenError();
          }
          // Una sola lectura del reloj sirve tanto para el día por defecto como para generatedAt.
          const instant = now();
          if (!(instant instanceof Date) || !Number.isFinite(instant.getTime()))
            throw invalidData();
          const parts = toLimaDateTimeParts(instant);
          const date = salesDateSchema.parse(
            requestedDate ?? `${parts.year}-${parts.month}-${parts.day}`,
          );
          const generatedAt = instant.toISOString();
          // PostgreSQL resuelve ambos límites en la zona real, incluso para fechas históricas.
          // El límite superior puede ser 10000-01-01; no se convierte a Date de JavaScript.
          const day = sequelize.escape(date);
          const rows = await models.Payment.findAll({
            where: {
              paidAt: {
                [Op.gte]: literal(`(${day}::date::timestamp AT TIME ZONE 'America/Lima')`),
                [Op.lt]: literal(`((${day}::date + 1)::timestamp AT TIME ZONE 'America/Lima')`),
              },
            },
            order: [
              ['paidAt', 'ASC'],
              ['id', 'ASC'],
            ],
            transaction,
          });
          const payments = rows.map(paymentView);
          const expectedOrders = new Map<number, number>();
          for (const payment of payments) {
            for (const item of payment.snapshot.bill.items) {
              if (expectedOrders.has(item.id)) throw invalidData();
              expectedOrders.set(item.id, payment.orderId);
            }
          }
          const itemAuthors = new Map<number, UserRef>();
          if (expectedOrders.size > 0) {
            const items = await models.OrderItem.findAll({
              attributes: ['id', 'orderId', 'createdByUserId'],
              where: { id: { [Op.in]: [...expectedOrders.keys()] } },
              transaction,
            });
            if (
              items.length !== expectedOrders.size ||
              items.some((item) => expectedOrders.get(item.id) !== item.orderId)
            )
              throw invalidData();
            const authorIds = [...new Set(items.map((item) => item.createdByUserId))];
            const authors = await models.User.findAll({
              attributes: ['id', 'displayName'],
              where: { id: { [Op.in]: authorIds } },
              transaction,
            });
            const authorsById = new Map(
              authors.map((author) => [
                author.id,
                {
                  id: author.id,
                  displayName: author.displayName,
                },
              ]),
            );
            for (const item of items) {
              const author = authorsById.get(item.createdByUserId);
              if (author === undefined) throw invalidData();
              itemAuthors.set(item.id, author);
            }
          }
          try {
            return buildDailySalesReport({ date, generatedAt, payments, itemAuthors });
          } catch (error) {
            if (error instanceof RangeError)
              throw new AppError({
                code: 'REPORT_TOTAL_OUT_OF_RANGE',
                httpStatus: 500,
                message: 'El total del reporte excede el rango permitido.',
              });
            if (error instanceof TypeError) throw invalidData();
            throw error;
          }
        },
      );
    },
  };
}
