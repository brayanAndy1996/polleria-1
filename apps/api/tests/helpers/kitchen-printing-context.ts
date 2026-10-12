import { createHash } from 'node:crypto';
import path from 'node:path';
import type { Sequelize } from 'sequelize';
import { vi } from 'vitest';
import { createKitchenTicketPrintService } from '../../src/services/kitchen-ticket-prints/kitchen-ticket-print.service.ts';
import { createOrderItemService } from '../../src/services/order-items/order-item.service.ts';
import { createPrinterService } from '../../src/services/printer/printer.service.ts';
import { createFilePrinterDriver } from '../../src/services/printer/file-driver.ts';
import { PRINT_TIME, seedPrinting } from './kitchen-printing-data.ts';

export async function setupPrinting(
  sequelize: Sequelize,
  fileDir: string,
  isDestinationSuspended = () => false,
) {
  const seed = await seedPrinting(sequelize);
  const printerService = createPrinterService({
    driver: createFilePrinterDriver({ dir: fileDir }),
    fileDir,
  });
  const wakeDispatcher = vi.fn();
  const prints = createKitchenTicketPrintService({
    models: seed.models,
    printerService,
    now: () => PRINT_TIME,
    wakeDispatcher,
    isDestinationSuspended,
  });
  const items = createOrderItemService({ models: seed.models, kitchenTicketPrintService: prints });
  async function send(key = 'send-first-013') {
    return items.sendItems(
      seed.order.id,
      { items: [{ productId: seed.drink.id, quantity: 2, notes: 'sin hielo' }] },
      key,
      { userId: seed.waiter.id },
    );
  }
  return { ...seed, printerService, prints, items, wakeDispatcher, send };
}

// Prepara un historial terminal válido, sin disparar el worker ni reescribir
// snapshot. Permite probar copias independientemente de despachar archivos.
export async function finishAttempt(
  sequelize: Sequelize,
  ticketId: number,
  status: 'succeeded' | 'failed' | 'uncertain' = 'succeeded',
  dir: string,
  active = false,
) {
  const documents = [
    { label: 'prueba', jobId: '20261012-183045-000-prueba-a1b2c3d4', lines: ['x'] },
  ];
  await sequelize.query(
    'UPDATE kitchen_ticket_print_attempts SET status=:status,documents=CAST(:documents AS jsonb),output_directory_hash=:hash,owner_host=:host,owner_pid=:pid,owner_execution_id=:execution,started_at=:date,finished_at=:finished,completed_pages=:pages,error_code=:error WHERE ticket_id=:ticket',
    {
      replacements: {
        status,
        documents: JSON.stringify(documents),
        hash: createHash('sha256').update(path.resolve(dir)).digest('hex'),
        host: 'localhost',
        pid: 123,
        execution: 'c10ce234-ecf9-4187-91d0-e132600ceda5',
        date: PRINT_TIME,
        finished: active ? null : PRINT_TIME,
        pages: status === 'succeeded' ? 1 : 0,
        error:
          status === 'succeeded'
            ? null
            : status === 'uncertain'
              ? 'PRINT_OUTPUT_UNCERTAIN'
              : 'PRINTER_OUTPUT_FAILED',
        ticket: ticketId,
      },
    },
  );
}
