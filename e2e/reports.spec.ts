// AC-09: setup API real y pantalla real; ejecutar solo tras UI lista y DB libre.
import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { dailySalesReportSchema, formatCashierSoles } from '../packages/shared/src/index.ts';
import { randomUUID } from 'node:crypto';

async function login(api: APIRequestContext, username: string, pin: string) {
  const response = await api.post('/api/auth/login', { data: { username, pin } });
  expect(response.status()).toBe(200);
}

test('AC-09: admin concilia efectivo con vuelto y Yape y consulta otro dia vacio', async ({
  browser,
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome', 'Recorrido funcional de escritorio.');
  const admin = await browser.newContext({ baseURL });
  const waiter = await browser.newContext({ baseURL });
  const cashier = await browser.newContext({ baseURL });
  try {
    await login(admin.request, 'e2e.admin', '135790');
    await login(waiter.request, 'e2e.mozo', '2468');
    await login(cashier.request, 'e2e.caja', '1357');
    const beforeResponse = await admin.request.get('/api/reports/daily-sales');
    expect(beforeResponse.status()).toBe(200);
    const before = dailySalesReportSchema.parse(await beforeResponse.json());
    const menuResponse = await waiter.request.get('/api/menu');
    expect(menuResponse.status()).toBe(200);
    const menu = (await menuResponse.json()) as { products: Array<{ id: number; name: string }> };
    const chicken = menu.products.find((p) => p.name === 'E2E Pollo')!;
    const drink = menu.products.find((p) => p.name === 'E2E Gaseosa')!;
    expect(chicken).toBeDefined();
    expect(drink).toBeDefined();
    for (const method of ['cash', 'yape'] as const) {
      const tableResponse = await admin.request.post('/api/tables', {
        data: { name: `E2E Reporte ${randomUUID().slice(0, 8)}` },
      });
      expect(tableResponse.status()).toBe(201);
      const table = (await tableResponse.json()) as { id: number };
      const orderResponse = await waiter.request.post(`/api/tables/${table.id}/orders`, {
        data: {},
      });
      expect(orderResponse.status()).toBe(201);
      const order = (await orderResponse.json()) as { id: number };
      const sent = await waiter.request.post(`/api/orders/${order.id}/items`, {
        headers: { 'Idempotency-Key': randomUUID() },
        data: {
          items:
            method === 'cash'
              ? [
                  { productId: chicken.id, quantity: 1, portion: 'quarter', cut: 'leg' },
                  { productId: drink.id, quantity: 1 },
                ]
              : [{ productId: drink.id, quantity: 1 }],
        },
      });
      expect(sent.status()).toBe(201);
      const billResponse = await cashier.request.get(`/api/orders/${order.id}/bill`);
      expect(billResponse.status()).toBe(200);
      const { bill } = (await billResponse.json()) as {
        bill: { billToken: string; totalCents: number };
      };
      const paid = await cashier.request.post(`/api/orders/${order.id}/payments`, {
        headers: { 'Idempotency-Key': randomUUID() },
        data: {
          method,
          receivedCents: method === 'cash' ? 3000 : bill.totalCents,
          billToken: bill.billToken,
          confirmedReceived: true,
        },
      });
      expect(paid.status()).toBe(201);
      const { payment } = (await paid.json()) as {
        payment: { amountCents: number; changeCents: number };
      };
      expect(payment).toMatchObject(
        method === 'cash'
          ? { amountCents: 2100, changeCents: 900 }
          : { amountCents: 400, changeCents: 0 },
      );
    }
    const response = await admin.request.get(`/api/reports/daily-sales?date=${before.date}`);
    expect(response.status()).toBe(200);
    const report = dailySalesReportSchema.parse(await response.json());
    expect(report.totalCents).toBe(before.totalCents + 2500);
    expect(report.paymentCount).toBe(before.paymentCount + 2);
    expect(report.methods[0]!.totalCents).toBe(before.methods[0]!.totalCents + 2100);
    expect(report.methods[1]!.totalCents).toBe(before.methods[1]!.totalCents + 400);
    expect(report.products.reduce((sum, row) => sum + row.totalCents, 0)).toBe(report.totalCents);
    expect(report.authors.reduce((sum, row) => sum + row.totalCents, 0)).toBe(report.totalCents);
    const authorTotal = (rows: typeof report.authors) =>
      rows
        .filter((row) => row.displayName === 'Mozo E2E')
        .reduce((sum, row) => sum + row.totalCents, 0);
    expect(authorTotal(report.authors)).toBe(authorTotal(before.authors) + 2500);
    const page = await admin.newPage();
    await page.goto('/admin/reportes');
    await expect(page.getByRole('heading', { name: 'Ventas cobradas', level: 1 })).toBeVisible();
    const summary = page.getByRole('region', { name: 'Resumen de ventas' });
    await expect(
      summary.getByText(formatCashierSoles(report.totalCents), { exact: true }),
    ).toBeVisible();
    await expect(summary).toContainText(String(report.paymentCount));
    await expect(page.getByText('E2E Pollo', { exact: true })).toBeVisible();
    await expect(page.getByText('E2E Gaseosa', { exact: true })).toBeVisible();
    await expect(page.getByText('Mozo E2E', { exact: true })).toBeVisible();
    await expect(page.getByText(/efectivo/i)).toBeVisible();
    await expect(page.getByText(/yape/i)).toBeVisible();
    await expect(
      page.getByText(formatCashierSoles(report.methods[0]!.totalCents), { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText(formatCashierSoles(report.methods[1]!.totalCents), { exact: true }).first(),
    ).toBeVisible();

    await page.getByLabel('Fecha').fill('2001-01-01');
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await expect(summary.getByText('S/ 0,00', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Fecha')).toHaveValue('2001-01-01');
  } finally {
    await Promise.all([admin.close(), waiter.close(), cashier.close()]);
  }
});
