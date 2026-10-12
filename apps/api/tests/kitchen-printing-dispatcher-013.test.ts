import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { readdir, readFile, writeFile, symlink, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Sequelize } from 'sequelize';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createKitchenTicketPrintDispatcher } from '../src/services/kitchen-ticket-prints/kitchen-ticket-print.dispatcher.ts';
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
function worker(overrides: Partial<Parameters<typeof createKitchenTicketPrintDispatcher>[0]> = {}) {
  const instance = createKitchenTicketPrintDispatcher({
    models: context.models,
    printerService: context.printerService,
    now: () => PRINT_TIME,
    owner,
    isOwnerEnded: async () => true,
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
      isOwnerEnded: async () => false,
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
      if (scenario === 'missing') await fs.unlink(filename);
      else if (scenario === 'different') await writeFile(filename, 'contenido ajeno\n');
      else if (scenario === 'symlink') {
        await fs.unlink(filename);
        const target = path.join(dir, 'original');
        await writeFile(target, row.documents![0]!.lines.join('\n') + '\n');
        await symlink(target, filename);
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
      const ended = vi.fn(async () => scenario === 'different-host');
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
