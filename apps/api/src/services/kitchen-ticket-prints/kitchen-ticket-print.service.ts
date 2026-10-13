import { Op, Transaction } from 'sequelize';
import { createHash } from 'node:crypto';
import { reprintKitchenTicketRequestSchema, idempotencyKeySchema } from '@polleria/shared';
import { AppError } from '../../errors/app-error.ts';
import type {
  KitchenTicketPrintAttemptView,
  KitchenTicketPrintsResponse,
  KitchenTicketPrintView,
  UserRole,
  KitchenTicketPrintAttentionResponse,
  ReprintKitchenTicketResponse,
} from '@polleria/shared';
import type {
  KitchenTicketPrintAttemptModel,
  KitchenTicketModel,
  Models,
} from '../../models/index.ts';
import type { PrinterService } from '../printer/printer.service.ts';
import { createOrderNotFoundError } from '../orders/order.service.ts';
import { kitchenTicketPrintSnapshotSchema } from './print-snapshot.ts';
import type { KitchenTicketPrintSnapshot } from './print-snapshot.ts';

export interface KitchenTicketPrintActor {
  userId: number;
  roles: readonly UserRole[];
}
export interface KitchenTicketPrintService {
  enqueue(snapshot: KitchenTicketPrintSnapshot, transaction: Transaction): Promise<void>;
  listForOrder(
    orderId: number,
    actor: KitchenTicketPrintActor,
  ): Promise<KitchenTicketPrintsResponse>;
  listAttention(
    afterTicketId: number | undefined,
    actor: KitchenTicketPrintActor,
  ): Promise<KitchenTicketPrintAttentionResponse>;
  requestReprint(
    ticketId: number,
    body: unknown,
    key: string,
    actor: KitchenTicketPrintActor,
  ): Promise<ReprintKitchenTicketResponse>;
}
export interface KitchenTicketPrintServiceDeps {
  models: Models;
  printerService: PrinterService;
  now?: () => Date;
  wakeDispatcher?: () => void;
  isDestinationSuspended?: () => boolean;
}
export function printAttemptView(
  attempt: KitchenTicketPrintAttemptModel,
): KitchenTicketPrintAttemptView {
  return {
    id: attempt.id,
    ticketId: attempt.ticketId,
    copyNumber: attempt.copyNumber,
    status: attempt.status,
    requestedBy: { id: attempt.requestedByUserId, displayName: attempt.requestedByName },
    createdAt: attempt.createdAt.toISOString(),
    startedAt: attempt.startedAt?.toISOString() ?? null,
    finishedAt: attempt.finishedAt?.toISOString() ?? null,
    pageCount: attempt.documents?.length ?? null,
    completedPages: attempt.completedPages,
    errorCode: attempt.errorCode ?? null,
  };
}
export function createKitchenTicketPrintService(
  deps: KitchenTicketPrintServiceDeps,
): KitchenTicketPrintService {
  const { models } = deps;
  const sequelize = models.KitchenTicket.sequelize;
  if (sequelize === undefined) throw new Error('Los modelos no están vinculados a Sequelize.');
  const now = deps.now ?? (() => new Date());
  const error = (code: string, message: string, httpStatus = 409) =>
    new AppError({ code, message, httpStatus });
  const inProgress = () =>
    error(
      'PRINT_IN_PROGRESS',
      'Esta comanda ya tiene una generación en curso. Espera antes de solicitar otra copia.',
    );
  const forbidden = () => error('FORBIDDEN', 'No tienes permiso para realizar esta acción.', 403);
  async function suspended(transaction: Transaction): Promise<boolean> {
    return (
      (deps.isDestinationSuspended?.() ?? false) ||
      (await models.KitchenTicketPrintAttempt.count({
        where: { status: 'uncertain', finishedAt: { [Op.is]: null } },
        transaction,
      })) > 0
    );
  }

  async function view(
    ticket: KitchenTicketModel,
    actor: KitchenTicketPrintActor,
    transaction: Transaction,
    suspended: boolean,
  ): Promise<KitchenTicketPrintView> {
    const snapshot = await models.KitchenTicketPrint.findByPk(ticket.id, { transaction });
    const attempt =
      snapshot === null
        ? null
        : await models.KitchenTicketPrintAttempt.findOne({
            where: { ticketId: ticket.id },
            order: [['id', 'DESC']],
            transaction,
          });
    const allowed =
      actor.roles.includes('admin') ||
      actor.roles.includes('cashier') ||
      (ticket.kind !== 'void' && actor.roles.includes('waiter'));
    const active =
      snapshot === null
        ? 0
        : await models.KitchenTicketPrintAttempt.count({
            where: { ticketId: ticket.id, finishedAt: { [Op.is]: null } },
            transaction,
          });
    return {
      ticketId: ticket.id,
      orderId: ticket.orderId,
      kind: ticket.kind,
      tablesAtIssue: snapshot?.snapshot.tablesAtIssue ?? [],
      status: attempt?.status ?? 'not_tracked',
      lastAttempt: attempt === null ? null : printAttemptView(attempt),
      canReprint:
        snapshot !== null &&
        attempt !== null &&
        attempt.finishedAt !== null &&
        active === 0 &&
        allowed &&
        !suspended,
    };
  }
  return {
    async requestReprint(ticketId, body, rawKey, actor) {
      const { reason } = reprintKitchenTicketRequestSchema.parse(body);
      const key = idempotencyKeySchema.parse(rawKey);
      const requestHash = createHash('sha256')
        .update(JSON.stringify({ ticketId, reason }))
        .digest('hex');
      return sequelize.transaction(async (transaction) => {
        // La clave es global en este scope; serializar incluso solicitudes sobre tickets distintos.
        await sequelize.query('SELECT pg_advisory_xact_lock(hashtextextended(:key, 13))', {
          replacements: { key },
          transaction,
        });
        const ticket = await models.KitchenTicket.findByPk(ticketId, { transaction });
        if (ticket === null) throw error('KITCHEN_TICKET_NOT_FOUND', 'Esa comanda no existe.', 404);
        if (!(
          actor.roles.includes('admin') ||
          actor.roles.includes('cashier') ||
          (ticket.kind !== 'void' && actor.roles.includes('waiter'))
        ))
          throw forbidden();
        const prior = await models.KitchenTicketPrintAttempt.findOne({
          where: { idempotencyKey: key },
          transaction,
        });
        if (prior !== null) {
          if (prior.ticketId !== ticketId || prior.requestHash !== requestHash)
            throw error('IDEMPOTENCY_CONFLICT', 'Esta clave de envío ya se usó con otros datos.');
          return prior.responseBody as ReprintKitchenTicketResponse;
        }
        const snapshot = await models.KitchenTicketPrint.findByPk(ticketId, {
          transaction,
          lock: transaction.LOCK.NO_KEY_UPDATE,
        });
        if (snapshot === null)
          throw error(
            'PRINT_SNAPSHOT_UNAVAILABLE',
            'Esta comanda es anterior a la generación de archivos y no tiene una copia original guardada.',
          );
        if (await suspended(transaction)) throw inProgress();
        if (
          await models.KitchenTicketPrintAttempt.count({
            where: { ticketId, finishedAt: { [Op.is]: null } },
            transaction,
          })
        )
          throw inProgress();
        const latest = await models.KitchenTicketPrintAttempt.findOne({
          where: { ticketId },
          order: [['copyNumber', 'DESC']],
          transaction,
        });
        const user = await models.User.findByPk(actor.userId, { transaction });
        if (user === null) throw forbidden();
        const attempt = await models.KitchenTicketPrintAttempt.create(
          {
            ticketId,
            copyNumber: (latest?.copyNumber ?? 0) + 1,
            status: 'queued',
            requestedByUserId: user.id,
            requestedByName: user.displayName,
            reason,
            idempotencyKey: key,
            requestHash,
            createdAt: now(),
          },
          { transaction },
        );
        const response = { attempt: printAttemptView(attempt) };
        await attempt.update({ responseBody: response }, { transaction });
        transaction.afterCommit(() => {
          try {
            deps.wakeDispatcher?.();
          } catch {
            /* barrido */
          }
        });
        return response;
      });
    },
    async listAttention(afterTicketId, actor) {
      if (!actor.roles.some((role) => ['waiter', 'cashier', 'admin'].includes(role)))
        throw forbidden();
      return sequelize.transaction(
        { isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ },
        async (transaction) => {
          const tickets = await models.KitchenTicket.findAll({
            where: { id: { [Op.gt]: afterTicketId ?? 0 } },
            order: [['id', 'ASC']],
            transaction,
          });
          const paused = await suspended(transaction);
          const entries: KitchenTicketPrintView[] = [];
          for (const ticket of tickets) {
            const entry = await view(ticket, actor, transaction, paused);
            if (entry.status === 'failed' || entry.status === 'uncertain') entries.push(entry);
            if (entries.length === 51) break;
          }
          return {
            prints: entries.slice(0, 50),
            nextAfterTicketId: entries.length > 50 ? entries[49]!.ticketId : null,
          };
        },
      );
    },
    async enqueue(input, transaction) {
      const snapshot = kitchenTicketPrintSnapshotSchema.parse(input);
      const createdAt = now();
      await models.KitchenTicketPrint.create(
        { ticketId: snapshot.ticket.id, snapshotVersion: 1, snapshot, createdAt },
        { transaction },
      );
      await models.KitchenTicketPrintAttempt.create(
        {
          ticketId: snapshot.ticket.id,
          copyNumber: 0,
          status: 'queued',
          requestedByUserId: snapshot.ticket.createdBy.id,
          requestedByName: snapshot.ticket.createdBy.displayName,
          createdAt,
        },
        { transaction },
      );
      // Un despertar perdido se recupera por el barrido; jamás hace fallar un commit ya realizado.
      transaction.afterCommit(() => {
        try {
          deps.wakeDispatcher?.();
        } catch {
          /* el barrido recupera pendientes */
        }
      });
    },
    async listForOrder(orderId, actor) {
      return sequelize.transaction(
        { isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ },
        async (transaction) => {
          if ((await models.Order.findByPk(orderId, { transaction })) === null)
            throw createOrderNotFoundError();
          const tickets = await models.KitchenTicket.findAll({
            where: { orderId },
            order: [['id', 'ASC']],
            transaction,
          });
          const paused = await suspended(transaction);
          return {
            prints: await Promise.all(
              tickets.map((ticket) => view(ticket, actor, transaction, paused)),
            ),
          };
        },
      );
    },
  };
}
