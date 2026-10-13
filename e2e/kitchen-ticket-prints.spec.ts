import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';

// El wrapper de Playwright debe pasar la MISMA ruta temporal a
// E2E_PRINTER_FILE_DIR (tests) y PRINTER_FILE_DIR (API). No se modifica .env.
function printerDirectory(): string {
  const supplied = process.env.E2E_PRINTER_FILE_DIR;
  if (!supplied || !isAbsolute(supplied))
    throw new Error('Falta E2E_PRINTER_FILE_DIR temporal absoluta en el wrapper E2E.');
  const path = resolve(supplied);
  const inside = relative(resolve(tmpdir()), path);
  if (!inside || inside.startsWith('..') || isAbsolute(inside))
    throw new Error('La carpeta de impresión E2E debe ser hija de tmpdir.');
  return path;
}
async function files(dir: string): Promise<string[]> {
  return (await readdir(dir)).filter((name) => name.endsWith('.txt')).sort();
}
async function outputSince(dir: string, before: string[]): Promise<string> {
  const added = (await files(dir)).filter((name) => !before.includes(name));
  expect(added.length).toBeGreaterThan(0);
  return (await Promise.all(added.map((name) => readFile(join(dir, name), 'utf8')))).join('\n');
}
async function login(
  page: Page,
  name: 'Mozo E2E' | 'Caja E2E' | 'Admin E2E',
  pin: string,
): Promise<void> {
  await page.goto('/login');
  const username =
    name === 'Mozo E2E' ? 'e2e.mozo' : name === 'Caja E2E' ? 'e2e.caja' : 'e2e.admin';
  await page.getByRole('button', { name: `${name} ${username}`, exact: true }).click();
  for (const digit of pin) await page.getByRole('button', { name: digit, exact: true }).click();
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(
    name === 'Admin E2E' ? /\/areas$/ : name === 'Caja E2E' ? /\/caja$/ : /\/mozo$/,
  );
}
async function noOverflow(page: Page): Promise<void> {
  expect(
    await page.evaluate<boolean>('document.documentElement.scrollWidth <= window.innerWidth'),
  ).toBe(true);
}
async function makeTable(admin: APIRequestContext): Promise<{ id: number; name: string }> {
  const name = `K013 ${randomUUID().slice(0, 8)}`;
  const response = await admin.post('/api/tables', { data: { name } });
  expect(response.status()).toBe(201);
  return response.json() as Promise<{ id: number; name: string }>;
}
async function product(request: APIRequestContext, name: string): Promise<number> {
  const response = await request.get('/api/menu');
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { products: { id: number; name: string }[] };
  const found = body.products.find((value) => value.name === name);
  expect(found).toBeTruthy();
  return found!.id;
}
async function ticketState(
  request: APIRequestContext,
  orderId: number,
  ticketId: number,
): Promise<string | undefined> {
  const response = await request.get(`/api/orders/${orderId}/ticket-prints`);
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { prints: { ticketId: number; status: string }[] };
  return body.prints.find((value) => value.ticketId === ticketId)?.status;
}
async function send(
  request: APIRequestContext,
  orderId: number,
  items: unknown[],
  key = randomUUID(),
) {
  const response = await request.post(`/api/orders/${orderId}/items`, {
    headers: { 'Idempotency-Key': key },
    data: { items },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as {
    order: { id: number; totalCents: number; items: { id: number }[] };
    ticket: { id: number };
  };
}
async function blockOutput(dir: string): Promise<() => Promise<void>> {
  const backup = `${dir}-saved-${randomUUID()}`;
  await rename(dir, backup);
  try {
    await writeFile(dir, 'Fallo file controlado por fixture E2E', { flag: 'wx' });
  } catch (error) {
    await rename(backup, dir);
    throw error;
  }
  return async () => {
    await unlink(dir);
    await rename(backup, dir);
  };
}

test.describe('013: recorridos file reales sin servicios externos', () => {
  test('AC-14: mozo 360 px envía mezcla, agrega, admin anula y copia sin duplicar por replay', async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    const dir = printerDirectory();
    await mkdir(dir, { recursive: true });
    const adminContext = await browser.newContext({ baseURL: 'http://localhost:3100' });
    const admin = await adminContext.newPage();
    try {
      await login(admin, 'Admin E2E', '135790');
      const table = await makeTable(admin.request);
      await login(page, 'Mozo E2E', '2468');
      await page.goto(`/mozo/mesas/${table.id}`);
      await page.getByRole('button', { name: 'Abrir mesa' }).click();
      await page.getByRole('link', { name: 'Agregar ítems' }).click();
      await page.getByRole('button', { name: /^E2E Pollo/ }).click();
      await page.getByRole('combobox', { name: 'Presentación' }).selectOption({ label: 'Cuarto' });
      await page.getByRole('combobox', { name: 'Parte' }).selectOption({ label: 'Pierna' });
      await page.getByRole('checkbox', { name: 'E2E Ají' }).check();
      await page.getByLabel('Observación').fill('sin ensalada');
      await page.getByRole('button', { name: 'Agregar al pedido' }).click();
      await page.getByRole('button', { name: /^E2E Gaseosa/ }).click();
      await page.getByRole('button', { name: 'Agregar al pedido' }).click();
      const before = await files(dir);
      const sentResponse = page.waitForResponse(
        (response) =>
          /\/api\/orders\/\d+\/items$/.test(response.url()) &&
          response.request().method() === 'POST',
      );
      await page.getByRole('button', { name: 'Enviar a cocina (2)' }).click();
      const initial = (await (await sentResponse).json()) as {
        order: { id: number; items: { id: number; productName: string }[] };
        ticket: { id: number };
      };
      await expect(
        page.getByText('Pedido registrado. Consulta la generación de la comanda.'),
      ).toBeVisible();
      await expect
        .poll(() => ticketState(page.request, initial.order.id, initial.ticket.id))
        .toBe('succeeded');
      await expect(page.getByText('Archivo generado')).toBeVisible();
      const printed = await outputSince(dir, before);
      expect(printed).toMatch(/INICIAL/);
      expect(printed).toContain(table.name);
      expect(printed).toMatch(/E2E Pollo/);
      expect(printed).toMatch(/pierna/i);
      expect(printed).toMatch(/E2E Gaseosa/);
      expect(printed).toMatch(/E2E Ají/);
      expect(printed).toContain('sin ensalada');
      await noOverflow(page);
      const gaseosaId = await product(page.request, 'E2E Gaseosa');
      const additional = await send(page.request, initial.order.id, [
        { productId: gaseosaId, quantity: 1 },
      ]);
      await expect
        .poll(() => ticketState(page.request, initial.order.id, additional.ticket.id))
        .toBe('succeeded');
      expect(await outputSince(dir, before)).toMatch(/ADICIONAL/);
      const item = initial.order.items.find((value) => value.productName === 'E2E Gaseosa');
      expect(item).toBeTruthy();
      const voidResponse = await admin.request.post(
        `/api/orders/${initial.order.id}/items/${item!.id}/void`,
        {
          headers: { 'Idempotency-Key': randomUUID() },
          data: { reason: 'Bebida equivocada' },
        },
      );
      expect(voidResponse.status()).toBe(200);
      const voidBody = (await voidResponse.json()) as { ticket: { id: number } };
      await expect
        .poll(() => ticketState(admin.request, initial.order.id, voidBody.ticket.id))
        .toBe('succeeded');
      expect(await outputSince(dir, before)).toMatch(/ANULADO/);
      await page.reload();
      const copiesBefore = await files(dir);
      await page.getByRole('button', { name: 'Solicitar copia' }).first().click();
      const dialog = page.getByRole('dialog');
      await expect(
        dialog.getByText('La salida anterior puede existir. La copia llevará REIMPRESIÓN.'),
      ).toBeVisible();
      await dialog.getByLabel('Motivo de la copia').fill('Revisé la salida y necesito otra copia');
      const copyResponse = page.waitForResponse(
        (response) => /\/reprint$/.test(response.url()) && response.request().method() === 'POST',
      );
      await dialog.getByRole('button', { name: 'Sí, generar copia' }).click();
      const accepted = await copyResponse;
      expect(accepted.status()).toBe(202);
      const original = (await accepted.json()) as { attempt: { ticketId: number } };
      await expect
        .poll(() => ticketState(page.request, initial.order.id, original.attempt.ticketId))
        .toBe('succeeded');
      const copyFiles = await files(dir);
      expect(copyFiles.length).toBeGreaterThan(copiesBefore.length);
      expect(await outputSince(dir, copiesBefore)).toMatch(/REIMPRESIÓN #1/);
      const replay = await page.request.post(new URL(accepted.url()).pathname, {
        headers: { 'Idempotency-Key': accepted.request().headers()['idempotency-key']! },
        data: accepted.request().postDataJSON() as Record<string, unknown>,
      });
      expect(replay.status()).toBe(202);
      expect(await replay.json()).toEqual(original);
      expect(await files(dir)).toEqual(copyFiles);
      await noOverflow(page);
    } finally {
      await adminContext.close();
    }
  });

  test('AC-14: fallo file real avisa mozo y caja desktop; caja confirma copia y conserva el pedido', async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    const dir = printerDirectory();
    await mkdir(dir, { recursive: true });
    const adminContext = await browser.newContext({ baseURL: 'http://localhost:3100' });
    const waiterContext = await browser.newContext({
      baseURL: 'http://localhost:3100',
      viewport: { width: 360, height: 740 },
    });
    const admin = await adminContext.newPage();
    const waiter = await waiterContext.newPage();
    let restore: (() => Promise<void>) | undefined;
    try {
      await login(admin, 'Admin E2E', '135790');
      const table = await makeTable(admin.request);
      await login(waiter, 'Mozo E2E', '2468');
      const opened = await waiter.request.post(`/api/tables/${table.id}/orders`, { data: {} });
      expect(opened.status()).toBe(201);
      const { id: orderId } = (await opened.json()) as { id: number };
      const productId = await product(waiter.request, 'E2E Gaseosa');
      restore = await blockOutput(dir);
      const sent = await send(waiter.request, orderId, [{ productId, quantity: 1 }]);
      await expect.poll(() => ticketState(waiter.request, orderId, sent.ticket.id)).toBe('failed');
      await waiter.goto('/mozo');
      const waiterRow = waiter
        .getByRole('listitem')
        .filter({ hasText: table.name })
        .filter({ hasText: 'No se pudo generar la comanda' });
      await expect(waiterRow.getByText('No se pudo generar la comanda')).toBeVisible();
      await noOverflow(waiter);
      await login(page, 'Caja E2E', '1357');
      const row = page.getByRole('listitem').filter({ hasText: table.name });
      await expect(row.getByText('No se pudo generar la comanda')).toBeVisible();
      await expect(page.getByText('Aquí cobrarás las cuentas.')).toBeVisible();
      await noOverflow(page);
      await restore();
      restore = undefined;
      const before = await files(dir);
      await row.getByRole('button', { name: 'Solicitar copia' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Motivo de la copia').fill('Carpeta restaurada y salida revisada');
      await expect(
        dialog.getByText('La salida anterior puede existir. La copia llevará REIMPRESIÓN.'),
      ).toBeVisible();
      await dialog.getByRole('button', { name: 'Sí, generar copia' }).click();
      await expect.poll(() => ticketState(page.request, orderId, sent.ticket.id)).toBe('succeeded');
      expect(await outputSince(dir, before)).toMatch(/REIMPRESIÓN #1/);
      const after = await page.request.get(`/api/orders/${orderId}`);
      expect(after.status()).toBe(200);
      const preserved = (await after.json()) as { items: unknown[]; totalCents: number };
      expect(preserved.items).toHaveLength(1);
      expect(preserved.totalCents).toBe(sent.order.totalCents);
      await expect(row).toHaveCount(0);
      await noOverflow(page);
    } finally {
      if (restore) await restore();
      await waiterContext.close();
      await adminContext.close();
    }
  });
});
