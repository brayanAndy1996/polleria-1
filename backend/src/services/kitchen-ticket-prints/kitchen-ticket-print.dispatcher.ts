import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { Op } from 'sequelize';
import type { Models, KitchenTicketPrintAttemptModel } from '../../models/index.ts';
import type { PrinterService } from '../printer/printer.service.ts';
import { PrinterError } from '../printer/printer-error.ts';
import { formatKitchenTicketDocuments } from './ticket-formatter.ts';
import { kitchenTicketPrintSnapshotSchema } from './print-snapshot.ts';

export interface PrintOwner {
  host: string;
  pid: number;
  executionId: string;
}
interface LockConnection {
  query(sql: string): Promise<{ rows: { acquired?: boolean }[] }>;
  on(event: 'error' | 'end', callback: () => void): void;
  removeListener(event: 'error' | 'end', callback: () => void): void;
}
export interface KitchenTicketPrintDispatcherDeps {
  models: Models;
  printerService: PrinterService;
  now?: () => Date;
  owner?: PrintOwner;
  isOwnerEnded?: (owner: PrintOwner) => Promise<boolean> | boolean;
  schedule?: (callback: () => void, delay: number) => unknown;
  cancelScheduled?(this: void, timer: unknown): void;
}
function ownerEnded(owner: PrintOwner): boolean {
  if (owner.host !== hostname()) return false;
  try {
    process.kill(owner.pid, 0);
    return false;
  } catch (error) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ESRCH';
  }
}

/** Un destino local, una conexión de advisory lock y ninguna transacción abierta durante fs. */
export function createKitchenTicketPrintDispatcher(deps: KitchenTicketPrintDispatcherDeps) {
  const { models, printerService } = deps;
  const sequelize = models.KitchenTicket.sequelize;
  if (sequelize === undefined) throw new Error('Los modelos no están vinculados a Sequelize.');
  const now = deps.now ?? (() => new Date());
  const owner = deps.owner ?? { host: hostname(), pid: process.pid, executionId: randomUUID() };
  const checkOwner = deps.isOwnerEnded ?? ownerEnded;
  const schedule = deps.schedule ?? ((callback, delay) => setTimeout(callback, delay));
  const cancel =
    deps.cancelScheduled ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  let connection: LockConnection | undefined;
  let lockLost = false;
  let suspended = true;
  let running = false;
  let stopped = false;
  let timer: unknown;
  let busy: Promise<void> | undefined;
  let activeAttempt: KitchenTicketPrintAttemptModel | undefined;
  const endedLocally = new Set<number>();
  const lost = () => {
    lockLost = true;
    suspended = true;
    // La llamada de fs sigue viva. Hacer visible la incertidumbre si otra conexión permite guardar.
    if (activeAttempt !== undefined)
      void models.KitchenTicketPrintAttempt.update(
        { status: 'uncertain', errorCode: 'PRINT_OUTPUT_UNCERTAIN' },
        { where: { id: activeAttempt.id, finishedAt: { [Op.is]: null } } },
      ).catch(() => undefined);
  };

  async function releaseLock() {
    const old = connection;
    connection = undefined;
    if (old === undefined) return;
    try {
      if (!lockLost) await old.query('SELECT pg_advisory_unlock(13013, 1)');
    } catch {
      /* conexión perdida */
    }
    old.removeListener('error', lost);
    old.removeListener('end', lost);
    await Promise.resolve(sequelize!.connectionManager.releaseConnection(old)).catch(
      () => undefined,
    );
  }
  async function acquireLock(): Promise<boolean> {
    if (stopped) return false;
    if (connection !== undefined && !lockLost) {
      try {
        await connection.query('SELECT 1');
        return true;
      } catch {
        lost();
      }
    }
    await releaseLock();
    let candidate: LockConnection | undefined;
    try {
      candidate = (await sequelize!.connectionManager.getConnection({
        type: 'write',
      })) as LockConnection;
      const result = await candidate.query('SELECT pg_try_advisory_lock(13013, 1) AS acquired');
      if (!result.rows[0]?.acquired) {
        await Promise.resolve(sequelize!.connectionManager.releaseConnection(candidate));
        return false;
      }
      connection = candidate;
      lockLost = false;
      candidate.on('error', lost);
      candidate.on('end', lost);
      return true;
    } catch {
      if (candidate !== undefined)
        await Promise.resolve(sequelize!.connectionManager.releaseConnection(candidate)).catch(
          () => undefined,
        );
      suspended = true;
      return false;
    }
  }
  async function finishByInspection(attempt: KitchenTicketPrintAttemptModel) {
    let exact = 0;
    let unknown = false;
    try {
      if (attempt.documents !== null) {
        if (attempt.outputDirectoryHash !== printerService.getOutputDirectoryHash()) unknown = true;
        else
          for (const job of attempt.documents) {
            const result = await printerService.inspectPrepared(job);
            if (result === 'exact') exact++;
            else if (result === 'uncertain') unknown = true;
          }
      }
    } catch {
      unknown = true;
    }
    const success = attempt.documents !== null && exact === attempt.documents.length && !unknown;
    await attempt.update({
      status: success ? 'succeeded' : unknown ? 'uncertain' : 'failed',
      completedPages: exact,
      finishedAt: now(),
      errorCode: success ? null : unknown ? 'PRINT_OUTPUT_UNCERTAIN' : 'PRINTER_OUTPUT_FAILED',
    });
  }
  async function reconcileOwned() {
    const interrupted = await models.KitchenTicketPrintAttempt.findAll({
      where: { status: { [Op.in]: ['printing', 'uncertain'] }, finishedAt: { [Op.is]: null } },
      order: [['id', 'ASC']],
    });
    let unresolved = false;
    for (const attempt of interrupted) {
      const previous = {
        host: attempt.ownerHost ?? '',
        pid: attempt.ownerPid ?? 0,
        executionId: attempt.ownerExecutionId ?? '',
      };
      const ownEnded = endedLocally.has(attempt.id) && previous.executionId === owner.executionId;
      let ended = ownEnded;
      if (!ended && previous.host === owner.host && previous.pid > 0) {
        try {
          ended = await checkOwner(previous);
        } catch {
          ended = false;
        }
      }
      if (!ended) {
        unresolved = true;
        await attempt.update({ status: 'uncertain', errorCode: 'PRINT_OUTPUT_UNCERTAIN' });
      } else await finishByInspection(attempt);
    }
    suspended = unresolved || lockLost;
    // No bloquear que el propietario original vuelva a conciliar su llamada ya terminada.
    if (unresolved) await releaseLock();
  }
  async function performTick() {
    if (!(await acquireLock())) return;
    await reconcileOwned();
    if (suspended || stopped) return;
    const attempt = await sequelize!.transaction(async (transaction) => {
      const row = await models.KitchenTicketPrintAttempt.findOne({
        where: { status: 'queued' },
        order: [['id', 'ASC']],
        transaction,
        lock: transaction.LOCK.UPDATE,
        skipLocked: true,
      });
      if (row === null) return null;
      const stored = await models.KitchenTicketPrint.findByPk(row.ticketId, { transaction });
      if (stored === null) throw new Error('Falta la instantánea de la comanda.');
      const snapshot = kitchenTicketPrintSnapshotSchema.parse(stored.snapshot);
      const copy =
        row.copyNumber === 0
          ? undefined
          : {
              copyNumber: row.copyNumber,
              requestedBy: { id: row.requestedByUserId, displayName: row.requestedByName },
              createdAt: row.createdAt.toISOString(),
              reason: row.reason!,
            };
      const documents = formatKitchenTicketDocuments(snapshot, copy).map((document, index) =>
        printerService.prepare({ ...document, label: `k-${row.id}-p${index + 1}` }, row.createdAt),
      );
      await row.update(
        {
          status: 'printing',
          startedAt: now(),
          ownerHost: owner.host,
          ownerPid: owner.pid,
          ownerExecutionId: owner.executionId,
          documents,
          outputDirectoryHash: printerService.getOutputDirectoryHash(),
        },
        { transaction },
      );
      return row;
    });
    if (attempt === null) return;
    activeAttempt = attempt;
    for (const job of attempt.documents!) {
      // Una comprobación fallida no cancela una llamada anterior, ni permite iniciar otra.
      if (stopped || !(await acquireLock())) {
        endedLocally.add(attempt.id);
        suspended = true;
        return;
      }
      let timedOut = false;
      let deadlineWrite: Promise<unknown> | undefined;
      const deadline = schedule(() => {
        timedOut = true;
        suspended = true;
        deadlineWrite = attempt
          .update({ status: 'uncertain', errorCode: 'PRINT_TIMEOUT' })
          .catch(() => {
            suspended = true;
          });
      }, 2000);
      try {
        await printerService.printPrepared(job);
      } catch (error) {
        cancel(deadline);
        await deadlineWrite;
        endedLocally.add(attempt.id);
        if (timedOut || lockLost) {
          if (await acquireLock()) await finishByInspection(attempt);
        } else
          await attempt.update({
            status: 'failed',
            errorCode: error instanceof PrinterError ? error.code : 'PRINTER_OUTPUT_FAILED',
            finishedAt: now(),
          });
        suspended = lockLost;
        return;
      }
      cancel(deadline);
      await deadlineWrite;
      endedLocally.add(attempt.id);
      if (timedOut || lockLost) {
        if (await acquireLock()) await finishByInspection(attempt);
        suspended = lockLost;
        return;
      }
      await attempt.update({ completedPages: attempt.completedPages + 1 });
      endedLocally.delete(attempt.id);
    }
    endedLocally.add(attempt.id);
    await attempt.update({ status: 'succeeded', errorCode: null, finishedAt: now() });
    suspended = false;
  }
  function tick(): Promise<void> {
    if (busy !== undefined || stopped) return Promise.resolve();
    const execution = performTick().catch(() => {
      suspended = true;
    });
    busy = execution;
    return execution.finally(() => {
      if (busy === execution) busy = undefined;
      activeAttempt = undefined;
    });
  }
  function sweep() {
    if (!running || stopped) return;
    timer = schedule(sweep, 500);
    void tick();
  }
  return {
    tick,
    async reconcile() {
      if (busy !== undefined || stopped) return;
      const execution = (async () => {
        if (await acquireLock()) await reconcileOwned();
      })().catch(() => {
        suspended = true;
      });
      busy = execution;
      await execution.finally(() => {
        if (busy === execution) busy = undefined;
      });
    },
    isSuspended: () => suspended,
    wake: () => {
      if (running) void tick();
    },
    start() {
      if (running || stopped) return;
      running = true;
      sweep();
    },
    async stop() {
      stopped = true;
      running = false;
      if (timer !== undefined) cancel(timer);
      await busy;
      await releaseLock();
    },
  };
}
