import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { readdir, readFile, writeFile, symlink, mkdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import type { Sequelize } from 'sequelize';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createKitchenTicketPrintDispatcher } from '../src/services/kitchen-ticket-prints/kitchen-ticket-print.dispatcher.ts';
import { createKitchenTicketPrintService } from '../src/services/kitchen-ticket-prints/kitchen-ticket-print.service.ts';
import { kitchenTicketPrintSnapshotSchema } from '../src/services/kitchen-ticket-prints/print-snapshot.ts';
import {
  clearMenuTables,
  clearOrderTables,
  closeTestDatabase,
  connectTestDatabase,
  migrateAndClearAuthTables,
} from './helpers/test-database.ts';
import { createTempDir, removeTempDir } from './helpers/printer-files.ts';
import { setupPrinting } from './helpers/kitchen-printing-context.ts';
import { PRINT_TIME, sqlRows } from './helpers/kitchen-printing-data.ts';

let sequelize: Sequelize;
let context: Awaited<ReturnType<typeof setupPrinting>>;
let dir: string;
let workers: ReturnType<typeof createKitchenTicketPrintDispatcher>[];
const owner = { host: hostname(), pid: process.pid, executionId: randomUUID() };
function barrier() {
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { waiting, release };
}
function manualClock() {
  let milliseconds = PRINT_TIME.getTime();
  let next = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  return {
    now: () => new Date(milliseconds),
    schedule: (callback: () => void, delay: number) => {
      const id = ++next;
      timers.set(id, { at: milliseconds + delay, callback });
      return id;
    },
    cancelScheduled: (id: number) => {
      timers.delete(id);
    },
    advance: (delta: number) => {
      milliseconds += delta;
      for (const [id, timer] of [...timers])
        if (timer.at <= milliseconds) {
          timers.delete(id);
          timer.callback();
        }
    },
    timers,
  };
}
async function attempts() {
  return sqlRows<{
    id: number;
    ticket_id: number;
    status: string;
    documents: { jobId: string; label: string; lines: string[] }[] | null;
    started_at: Date | null;
    finished_at: Date | null;
    owner_host: string | null;
    owner_pid: number | null;
    owner_execution_id: string | null;
    output_directory_hash: string | null;
    completed_pages: number;
    error_code: string | null;
  }>(sequelize, 'SELECT * FROM kitchen_ticket_print_attempts ORDER BY id');
}
async function expandSnapshotToMultiplePages(ticketId: number): Promise<void> {
  const [row] = await sqlRows<{ snapshot: unknown }>(
    sequelize,
    'SELECT snapshot FROM kitchen_ticket_prints WHERE ticket_id=:ticket',
    { ticket: ticketId },
  );
  const original = kitchenTicketPrintSnapshotSchema.parse(row!.snapshot);
  const base = original.ticket.items[0]!;
  const items = Array.from({ length: 20 }, (_, itemIndex) => ({
    ...base,
    id: itemIndex + 1,
    productName: `Producto-${itemIndex + 1}`,
    productCategory: 'combo' as const,
    portion: null,
    cut: null,
    breastEighths: 0,
    legEighths: 0,
    notes: `N${String(itemIndex + 1).padStart(2, '0')}-` + 'Z'.repeat(196),
    sauces: Array.from({ length: 6 }, (_, sauceIndex) => ({
      productId: base.productId,
      productName: `Crema-${itemIndex + 1}-${sauceIndex + 1}-` + 'W'.repeat(42),
      quantity: 1,
      priceCents: 0,
    })),
    components: Array.from({ length: 10 }, (_, componentIndex) => ({
      productId: base.productId,
      productName: `Componente-${itemIndex + 1}-${componentIndex + 1}-` + 'Q'.repeat(38),
      quantity: 1,
      portion: null,
      cut: null,
      breastEighths: 0,
      legEighths: 0,
    })),
  }));
  const snapshot = kitchenTicketPrintSnapshotSchema.parse({
    ...original,
    ticket: { ...original.ticket, items },
  });
  await sequelize.query(
    'UPDATE kitchen_ticket_prints SET snapshot=CAST(:snapshot AS jsonb) WHERE ticket_id=:ticket',
    { replacements: { snapshot: JSON.stringify(snapshot), ticket: ticketId } },
  );
}
function worker(overrides: Partial<Parameters<typeof createKitchenTicketPrintDispatcher>[0]> = {}) {
  const instance = createKitchenTicketPrintDispatcher({
    models: context.models,
    printerService: context.printerService,
    now: () => PRINT_TIME,
    owner,
    isOwnerEnded: () => Promise.resolve(true),
    ...overrides,
  });
  workers.push(instance);
  return instance;
}
beforeAll(async () => {
  sequelize = await connectTestDatabase();
});
afterAll(async () => {
  await closeTestDatabase(sequelize);
});
beforeEach(async () => {
  await migrateAndClearAuthTables(sequelize);
  await clearOrderTables(sequelize);
  await clearMenuTables(sequelize);
  dir = await createTempDir();
  context = await setupPrinting(sequelize, dir);
  workers = [];
});
afterEach(async () => {
  for (const instance of workers) await instance.stop();
  vi.restoreAllMocks();
  await removeTempDir(dir);
});

describe('013: despacho local exclusivo y recuperación sin repetir I/O', () => {
  it('AC-07: arranca suspendido hasta revisar propietario e intentos interrumpidos', async () => {
    const sent = await context.send();
    await sequelize.query(
      "UPDATE kitchen_ticket_print_attempts SET status='failed',finished_at=:finished,error_code='PRINTER_OUTPUT_FAILED' WHERE ticket_id=:ticket",
      { replacements: { finished: PRINT_TIME, ticket: sent.ticket.id } },
    );
    const dispatcherRef: { current?: ReturnType<typeof createKitchenTicketPrintDispatcher> } = {};
    const printService = createKitchenTicketPrintService({
      models: context.models,
      printerService: context.printerService,
      now: () => PRINT_TIME,
      isDestinationSuspended: () => dispatcherRef.current?.isSuspended() ?? true,
    });
    const instance = worker();
    dispatcherRef.current = instance;

    expect(instance.isSuspended()).toBe(true);
    expect(
      (
        await printService.listForOrder(context.order.id, {
          userId: context.waiter.id,
          roles: ['waiter'],
        })
      ).prints[0]!.canReprint,
    ).toBe(false);

    await instance.reconcile();
    expect(instance.isSuspended()).toBe(false);
    expect(
      (
        await printService.listForOrder(context.order.id, {
          userId: context.waiter.id,
          roles: ['waiter'],
        })
      ).prints[0]!.canReprint,
    ).toBe(true);
  });

  it('AC-07: persiste documentos, hash y propietario antes de PrinterService, con un solo archivo completo y venta intacta', async () => {
    const sent = await context.send();
    const before = await sqlRows(sequelize, 'SELECT * FROM order_items');
    const realPrint = context.printerService.printPrepared.bind(context.printerService);
    const output = vi
      .spyOn(context.printerService, 'printPrepared')
      .mockImplementation(async (job) => {
        const row = (await attempts())[0]!;
        expect(row.status).toBe('printing');
        expect(row.started_at).not.toBeNull();
        expect(row.finished_at).toBeNull();
        expect(row.owner_host).toBe(owner.host);
        expect(row.owner_pid).toBe(owner.pid);
        expect(row.owner_execution_id).toBe(owner.executionId);
        expect(row.output_directory_hash).toBe(context.printerService.getOutputDirectoryHash());
        expect(row.documents).toContainEqual(job);
        expect(job.label).toBe(`k-${row.id}-p1`);
        return realPrint(job);
      });
    await worker().tick();
    const row = (await attempts())[0]!;
    expect(row.status).toBe('succeeded');
    expect(row.completed_pages).toBe(row.documents!.length);
    expect(row.finished_at).not.toBeNull();
    expect(output).toHaveBeenCalledTimes(1);
    const files = await readdir(dir);
    expect(files).toEqual([`${row.documents![0]!.jobId}.txt`]);
    expect(await readFile(path.join(dir, files[0]!), 'utf8')).toBe(
      row.documents![0]!.lines.join('\n') + '\n',
    );
    expect(await sqlRows(sequelize, 'SELECT * FROM order_items')).toEqual(before);
    expect(sent.order.totalCents).toBe(1600);
  });

  it('AC-07: dos despachadores con advisory lock real y ticks paralelos mantienen máximo una salida en vuelo', async () => {
    await context.send();
    await context.send('second-ticket');
    const pending = barrier();
    let active = 0,
      maxActive = 0;
    const realPrint = context.printerService.printPrepared.bind(context.printerService);
    const output = vi
      .spyOn(context.printerService, 'printPrepared')
      .mockImplementation(async (job) => {
        active++;
        maxActive = Math.max(maxActive, active);
        try {
          await pending.waiting;
          return await realPrint(job);
        } finally {
          active--;
        }
      });
    const a = worker();
    const b = worker({
      owner: { ...owner, executionId: randomUUID() },
      isOwnerEnded: () => Promise.resolve(false),
    });
    const first = a.tick();
    try {
      await vi.waitFor(() => expect(output).toHaveBeenCalledTimes(1));
      await Promise.all([a.tick(), b.tick()]);
      expect(output).toHaveBeenCalledTimes(1);
      expect(maxActive).toBe(1);
    } finally {
      pending.release();
      await first;
    }
    await a.tick();
    expect(maxActive).toBe(1);
    expect((await attempts()).map((row) => row.status)).toEqual(['succeeded', 'succeeded']);
  });

  it('AC-07: fallo definitivo deja failed seguro sin cambiar venta ni reintentar automáticamente', async () => {
    const sent = await context.send();
    const before = await sqlRows(sequelize, 'SELECT * FROM order_items');
    const output = vi
      .spyOn(context.printerService, 'printPrepared')
      .mockRejectedValue(
        Object.assign(new Error('/ruta/privada/impresora.txt'), { code: 'EACCES' }),
      );
    const instance = worker();
    await instance.tick();
    await instance.tick();
    const row = (await attempts())[0]!;
    expect(row.status).toBe('failed');
    expect(row.finished_at).not.toBeNull();
    expect(row.error_code).toBe('PRINTER_OUTPUT_FAILED');
    expect(output).toHaveBeenCalledTimes(1);
    expect(await sqlRows(sequelize, 'SELECT * FROM order_items')).toEqual(before);
    expect(sent.order.totalCents).toBe(1600);
  });

  it('AC-07: deadline de página mantiene uncertain activo y destino suspendido hasta respuesta tardía; no duplica salida', async () => {
    await context.send();
    await context.send('second-ticket');
    const pending = barrier();
    const clock = manualClock();
    const realPrint = context.printerService.printPrepared.bind(context.printerService);
    const output = vi
      .spyOn(context.printerService, 'printPrepared')
      .mockImplementation(async (job) => {
        await pending.waiting;
        return realPrint(job);
      });
    const instance = worker(clock);
    const first = instance.tick();
    try {
      await vi.waitFor(() => expect(output).toHaveBeenCalledTimes(1));
      clock.advance(2001);
      await vi.waitFor(async () =>
        expect((await attempts())[0]).toMatchObject({
          status: 'uncertain',
          finished_at: null,
          error_code: 'PRINT_TIMEOUT',
        }),
      );
      expect(instance.isSuspended()).toBe(true);
      await instance.tick();
      expect(output).toHaveBeenCalledTimes(1);
      expect((await attempts())[1]!.status).toBe('queued');
    } finally {
      pending.release();
      await first;
    }
    await vi.waitFor(async () => expect((await attempts())[0]!.status).toBe('succeeded'));
    expect(output).toHaveBeenCalledTimes(1);
    expect(instance.isSuspended()).toBe(false);
    await instance.tick();
    expect(output).toHaveBeenCalledTimes(2);
  });

  it('AC-07: perder la conexión del lock durante I/O suspende destino y reconcilia sin duplicar', async () => {
    await context.send();
    await context.send('second-ticket');
    const pending = barrier();
    const realPrint = context.printerService.printPrepared.bind(context.printerService);
    const output = vi
      .spyOn(context.printerService, 'printPrepared')
      .mockImplementation(async (job) => {
        await pending.waiting;
        return realPrint(job);
      });
    const manager = sequelize.connectionManager;
    const originalGetConnection = manager.getConnection.bind(manager);
    let lockConnection: Awaited<ReturnType<typeof originalGetConnection>> | undefined;
    vi.spyOn(manager, 'getConnection').mockImplementation(async (options) => {
      const connection = await originalGetConnection(options);
      lockConnection ??= connection;
      return connection;
    });
    const instance = worker();
    const first = instance.tick();
    try {
      await vi.waitFor(() => expect(output).toHaveBeenCalledTimes(1));
      expect(lockConnection).toBeDefined();
      await manager.destroyConnection(lockConnection!);
      await vi.waitFor(async () => expect((await attempts())[0]!.status).toBe('uncertain'));
      expect(instance.isSuspended()).toBe(true);
      expect(
        (
          await context.prints.listForOrder(context.order.id, {
            userId: context.waiter.id,
            roles: ['waiter'],
          })
        ).prints.every((entry) => !entry.canReprint),
      ).toBe(true);
      await instance.tick();
      expect(output).toHaveBeenCalledTimes(1);
      expect((await attempts())[1]!.status).toBe('queued');
    } finally {
      pending.release();
      await first;
    }
    expect((await attempts())[0]).toMatchObject({ status: 'succeeded', completed_pages: 1 });
    expect(output).toHaveBeenCalledTimes(1);
    expect(instance.isSuspended()).toBe(false);
  });

  it('AC-07: stop espera I/O activo y no reclama el siguiente intento', async () => {
    await context.send();
    await context.send('second-ticket');
    const pending = barrier();
    const realPrint = context.printerService.printPrepared.bind(context.printerService);
    const output = vi
      .spyOn(context.printerService, 'printPrepared')
      .mockImplementation(async (job) => {
        await pending.waiting;
        return realPrint(job);
      });
    const instance = worker();
    const first = instance.tick();
    let stopFinished = false;
    let stop: Promise<void> | undefined;
    try {
      await vi.waitFor(() => expect(output).toHaveBeenCalledTimes(1));
      stop = instance.stop().then(() => {
        stopFinished = true;
      });
      await Promise.resolve();
      expect(stopFinished).toBe(false);
      expect((await attempts())[1]!.status).toBe('queued');
      expect(output).toHaveBeenCalledTimes(1);
    } finally {
      pending.release();
      await first;
      await stop;
    }
    expect(stopFinished).toBe(true);
    expect((await attempts()).map((row) => row.status)).toEqual(['succeeded', 'queued']);
    expect(output).toHaveBeenCalledTimes(1);
  });

  it('AC-07: persiste todas las páginas y un fallo parcial conserva páginas completas y venta', async () => {
    const firstSent = await context.send();
    const secondSent = await context.send('second-ticket');
    await expandSnapshotToMultiplePages(firstSent.ticket.id);
    await expandSnapshotToMultiplePages(secondSent.ticket.id);
    const beforeItems = await sqlRows(sequelize, 'SELECT * FROM order_items ORDER BY id');
    const rows = await attempts();
    const firstId = rows[0]!.id;
    const secondId = rows[1]!.id;
    const realPrint = context.printerService.printPrepared.bind(context.printerService);
    const output = vi
      .spyOn(context.printerService, 'printPrepared')
      .mockImplementation(async (job) => {
        if (job.label === `k-${secondId}-p2`)
          throw Object.assign(new Error('fallo página 2'), { code: 'EIO' });
        return realPrint(job);
      });
    const instance = worker();

    await instance.tick();
    const completed = (await attempts()).find((row) => row.id === firstId)!;
    expect(completed.status).toBe('succeeded');
    expect(completed.documents!.length).toBeGreaterThan(1);
    expect(completed.completed_pages).toBe(completed.documents!.length);
    expect(
      completed.documents!.every((job) =>
        output.mock.calls.some(([sent]) => sent.jobId === job.jobId),
      ),
    ).toBe(true);

    await instance.tick();
    const partial = (await attempts()).find((row) => row.id === secondId)!;
    expect(partial.status).toBe('failed');
    expect(partial.completed_pages).toBe(1);
    expect(partial.finished_at).not.toBeNull();
    expect(partial.error_code).toBe('PRINTER_OUTPUT_FAILED');
    expect(await readdir(dir)).toContain(`${partial.documents![0]!.jobId}.txt`);
    expect(await readdir(dir)).not.toContain(`${partial.documents![1]!.jobId}.txt`);
    expect(await sqlRows(sequelize, 'SELECT * FROM order_items ORDER BY id')).toEqual(beforeItems);
    expect(firstSent.order.totalCents).toBe(1600);
    expect(secondSent.order.totalCents).toBe(3200);
  });

  it('AC-08: pérdida del ACK PostgreSQL tras escribir se concilia sin repetir PrinterService', async () => {
    await context.send();
    const model = context.models.KitchenTicketPrintAttempt;
    const updatePrototype = Object.getOwnPropertyDescriptor(model.prototype, 'update')
      ? model.prototype
      : Reflect.getPrototypeOf(model.prototype);
    const originalUpdate = updatePrototype
      ? (Object.getOwnPropertyDescriptor(updatePrototype, 'update')?.value as
          InstanceType<typeof model>['update'] | undefined)
      : undefined;
    if (!originalUpdate) throw new Error('Falta update original para simular pérdida de ACK.');
    let loseAcknowledgement = true;
    vi.spyOn(model.prototype, 'update').mockImplementation(async function (
      this: InstanceType<typeof model>,
      ...args
    ) {
      const values = args[0];
      const result = await originalUpdate.apply(this, args);
      if (loseAcknowledgement && values.status === 'succeeded') {
        loseAcknowledgement = false;
        throw new Error('respuesta de PostgreSQL perdida después del commit');
      }
      return result;
    });
    const output = vi.spyOn(context.printerService, 'printPrepared');
    const instance = worker();
    await instance.tick();
    expect(loseAcknowledgement).toBe(false);
    expect((await attempts())[0]).toMatchObject({ status: 'succeeded', completed_pages: 1 });
    expect(output).toHaveBeenCalledTimes(1);

    await instance.reconcile();
    expect((await attempts())[0]!.status).toBe('succeeded');
    expect(output).toHaveBeenCalledTimes(1);
  });

  it('AC-08: caída rename→ack se reconcilia exacta sin segunda llamada a printPrepared', async () => {
    await context.send();
    const first = worker();
    await first.tick();
    await first.stop();
    const before = await readdir(dir);
    await sequelize.query(
      "UPDATE kitchen_ticket_print_attempts SET status='printing',finished_at=NULL,completed_pages=0",
    );
    const output = vi.spyOn(context.printerService, 'printPrepared');
    await worker().reconcile();
    expect((await attempts())[0]!.status).toBe('succeeded');
    expect(output).not.toHaveBeenCalled();
    expect(await readdir(dir)).toEqual(before);
  });

  it.each(['missing', 'different', 'symlink', 'directory', 'changed-directory'] as const)(
    'AC-08: salida %s se reconcilia sin sobrescribir ni generar otra página',
    async (scenario) => {
      await context.send();
      const first = worker();
      await first.tick();
      await first.stop();
      const row = (await attempts())[0]!;
      const filename = path.join(dir, `${row.documents![0]!.jobId}.txt`);
      const fs = await import('node:fs/promises');
      let protectedFile: string | undefined;
      const protectedContent = row.documents![0]!.lines.join('\n') + '\n';
      if (scenario === 'missing') await fs.unlink(filename);
      else if (scenario === 'different') await writeFile(filename, 'contenido ajeno\n');
      else if (scenario === 'symlink') {
        await fs.unlink(filename);
        const target = path.join(dir, 'original');
        await writeFile(target, protectedContent);
        protectedFile = target;
        try {
          await symlink(target, filename);
        } catch (error) {
          if (
            process.platform !== 'win32' ||
            !(error instanceof Error) ||
            !('code' in error) ||
            error.code !== 'EPERM'
          )
            throw error;
          // Windows permite junctions reales sin el privilegio de file symlink.
          const targetDirectory = path.join(dir, 'protected-original');
          await mkdir(targetDirectory);
          protectedFile = path.join(targetDirectory, 'original.txt');
          await writeFile(protectedFile, protectedContent);
          await symlink(targetDirectory, filename, 'junction');
        }
        expect((await lstat(filename)).isSymbolicLink()).toBe(true);
      } else if (scenario === 'directory') {
        await fs.unlink(filename);
        await mkdir(filename);
      } else
        await sequelize.query(
          'UPDATE kitchen_ticket_print_attempts SET output_directory_hash=:hash',
          { replacements: { hash: 'f'.repeat(64) } },
        );
      await sequelize.query(
        "UPDATE kitchen_ticket_print_attempts SET status='printing',finished_at=NULL,completed_pages=0",
      );
      const before = await readdir(dir);
      const output = vi.spyOn(context.printerService, 'printPrepared');
      await worker().reconcile();
      expect((await attempts())[0]!.status).toBe(scenario === 'missing' ? 'failed' : 'uncertain');
      expect(output).not.toHaveBeenCalled();
      expect(await readdir(dir)).toEqual(before);
      if (protectedFile !== undefined)
        expect(await readFile(protectedFile, 'utf8')).toBe(protectedContent);
      if (scenario === 'different')
        expect(await readFile(filename, 'utf8')).toBe('contenido ajeno\n');
    },
  );

  it.each(['live-pid', 'reused-pid', 'different-host', 'doubtful-check'] as const)(
    'AC-08: propietario %s no acredita fin; mantiene uncertain activo, suspende todo y no hace I/O',
    async (scenario) => {
      await context.send();
      const first = worker();
      await first.tick();
      await first.stop();
      await sequelize.query(
        "UPDATE kitchen_ticket_print_attempts SET status='printing',finished_at=NULL,owner_host=:host",
        { replacements: { host: scenario === 'different-host' ? 'otro-servidor' : owner.host } },
      );
      const ended = vi.fn(() => Promise.resolve(scenario === 'different-host'));
      const output = vi.spyOn(context.printerService, 'printPrepared');
      const inspection = vi.spyOn(context.printerService, 'inspectPrepared');
      const instance = worker({ isOwnerEnded: ended });
      await instance.reconcile();
      expect((await attempts())[0]).toMatchObject({
        status: 'uncertain',
        finished_at: null,
        error_code: 'PRINT_OUTPUT_UNCERTAIN',
      });
      expect(instance.isSuspended()).toBe(true);
      expect(output).not.toHaveBeenCalled();
      expect(inspection).not.toHaveBeenCalled();
      await instance.tick();
      expect(output).not.toHaveBeenCalled();
    },
  );

  it('AC-08: fallo antes de persistir documents queda failed recuperable, mientras queued comprometido sí se genera', async () => {
    await context.send();
    await context.send('second-ticket');
    await sequelize.query(
      "UPDATE kitchen_ticket_print_attempts SET status='printing',started_at=:date,owner_host=:host,owner_pid=:pid,owner_execution_id=:execution WHERE copy_number=0 AND id=(SELECT min(id) FROM kitchen_ticket_print_attempts)",
      {
        replacements: {
          date: PRINT_TIME,
          host: owner.host,
          pid: owner.pid,
          execution: owner.executionId,
        },
      },
    );
    const instance = worker();
    await instance.reconcile();
    expect((await attempts())[0]).toMatchObject({ status: 'failed', documents: null });
    await instance.tick();
    expect((await attempts()).map((row) => row.status)).toEqual(['failed', 'succeeded']);
  });

  it('AC-14: comanda típica sin cola genera todos los archivos y registro en menos de3s desde commit', async () => {
    await context.send();
    const started = performance.now();
    const instance = worker();
    instance.start();
    await vi.waitFor(async () => expect((await attempts())[0]!.status).toBe('succeeded'), {
      timeout: 3000,
    });
    expect(performance.now() - started).toBeLessThan(3000);
    expect((await readdir(dir)).filter((file) => file.endsWith('.txt'))).toHaveLength(1);
  });
  it('AC-14: barrido usa intervalos de máximo500ms y stop cancela nuevas reclamaciones', async () => {
    const clock = manualClock();
    const instance = worker(clock);
    instance.start();
    expect(clock.timers.size).toBeGreaterThan(0);
    expect(
      [...clock.timers.values()].every((timer) => timer.at - PRINT_TIME.getTime() <= 500),
    ).toBe(true);
    await instance.stop();
    expect(clock.timers.size).toBe(0);
  });
});
