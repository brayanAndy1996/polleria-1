import { Op, Transaction } from 'sequelize';
import type {
  KitchenTicketPrintAttemptView,
  KitchenTicketPrintsResponse,
  KitchenTicketPrintView,
  UserRole,
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
    errorCode: attempt.errorCode,
  };
}
export function createKitchenTicketPrintService(
  deps: KitchenTicketPrintServiceDeps,
): KitchenTicketPrintService {
  const { models } = deps;
  const sequelize = models.KitchenTicket.sequelize;
  if (sequelize === undefined) throw new Error('Los modelos no están vinculados a Sequelize.');
  const now = deps.now ?? (() => new Date());

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
        allowed &&
        !suspended,
    };
  }
  return {
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
          const suspended =
            (deps.isDestinationSuspended?.() ?? false) ||
            (await models.KitchenTicketPrintAttempt.count({
              where: { status: 'uncertain', finishedAt: { [Op.is]: null } },
              transaction,
            })) > 0;
          return {
            prints: await Promise.all(
              tickets.map((ticket) => view(ticket, actor, transaction, suspended)),
            ),
          };
        },
      );
    },
  };
}
