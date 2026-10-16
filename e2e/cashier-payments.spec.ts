// AC-15: recorridos de cobro real en polleria_test (desktop efectivo y móvil Yape).
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

async function login(page: Page, role: 'waiter' | 'cashier' | 'admin') {
  await page.request.post('/api/auth/logout');
  await page.goto('/login');
  const user = role === 'waiter' ? 'Mozo E2E' : role === 'cashier' ? 'Caja E2E' : 'Admin E2E';
  const pin = role === 'waiter' ? '2468' : role === 'cashier' ? '1357' : '135790';
  const username = role === 'waiter' ? 'e2e.mozo' : role === 'cashier' ? 'e2e.caja' : 'e2e.admin';
  await page.getByRole('button', { name: `${user} ${username}`, exact: true }).click();
  for (const digit of pin) await page.getByRole('button', { name: digit, exact: true }).click();
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(
    role === 'admin' ? /\/areas$/ : role === 'waiter' ? /\/mozo$/ : /\/caja$/,
  );
}

async function prepareOrder(page: Page, itemNames: string[]) {
  await login(page, 'admin');
  const createdTable = await page.request.post('/api/tables', {
    data: { name: `E2E Caja ${randomUUID().slice(0, 8)}` },
  });
  expect(createdTable.status()).toBe(201);
  const table = (await createdTable.json()) as { id: number; name: string };
  await login(page, 'waiter');
  const opened = await page.request.post(`/api/tables/${table.id}/orders`, { data: {} });
  expect(opened.status()).toBe(201);
  const order = (await opened.json()) as { id: number };
  const menuResponse = await page.request.get('/api/menu');
  expect(menuResponse.ok()).toBe(true);
  const menu = (await menuResponse.json()) as { products: { id: number; name: string }[] };
  const items = itemNames.map((name) => {
    const product = menu.products.find((entry) => entry.name === name);
    expect(product, `producto ${name}`).toBeTruthy();
    if (name === 'E2E Pollo')
      return { productId: product!.id, quantity: 1, portion: 'quarter', cut: 'leg' };
    return { productId: product!.id, quantity: 1 };
  });
  const sent = await page.request.post(`/api/orders/${order.id}/items`, {
    headers: { 'Idempotency-Key': randomUUID() },
    data: { items },
  });
  expect(sent.status()).toBe(201);
  return { orderId: order.id, tableId: table.id };
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(
    true,
  );
}

test.describe('014: cobro completo de Caja', () => {
  test('AC-15: desktop revisa pre-cuenta mixta, cobra en efectivo y consulta el snapshot', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chrome', 'Solo aplica a escritorio.');
    const { orderId, tableId } = await prepareOrder(page, ['E2E Pollo', 'E2E Gaseosa']);
    await page.addInitScript("Object.defineProperty(window, 'print', { value: () => undefined })");
    await page.goto(`/mozo/pedidos/${orderId}/cuenta`);
    await expect(page.getByText('PRE-CUENTA')).toBeVisible();
    await expect(page.getByText('No es comprobante de pago')).toBeVisible();
    await expect(page.getByRole('button', { name: /revisar cobro|cobrar/i })).toHaveCount(0);
    await page.getByRole('button', { name: /imprimir pre-cuenta/i }).click();
    expect((await page.request.get(`/api/orders/${orderId}/bill`)).status()).toBe(200);
    await login(page, 'cashier');
    await page.goto('/caja');
    await page.getByRole('link', { name: new RegExp(`Pedido #${orderId}`) }).click();
    await expect(page.getByText('S/ 21,00')).toBeVisible();
    await page.getByLabel(/monto recibido \(s\/\)/i).fill('30');
    await expect(page.getByText('S/ 9,00')).toBeVisible();
    await page.getByRole('button', { name: /revisar cobro/i }).click();
    await expect(page.getByRole('dialog')).toContainText('S/ 30,00');
    await page.getByRole('button', { name: /confirmar cobro/i }).click();
    await expect(page).toHaveURL(/\/caja\/pagos\/\d+$/);
    const receipt = page.getByRole('region', { name: 'Pago confirmado' });
    await expect(receipt.getByText('S/ 21,00')).toBeVisible();
    await expect(receipt.getByText('S/ 30,00')).toBeVisible();
    await expect(receipt.getByText('S/ 9,00')).toBeVisible();
    const tables = await page.request.get('/api/tables');
    const body = (await tables.json()) as { tables: { id: number; state: string }[] };
    expect(body.tables.find((table) => table.id === tableId)?.state).toBe('free');
  });

  test('AC-15: móvil confirma Yape, muestra vuelto cero y mantiene el ancho de 360 px', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chrome', 'Solo aplica a móvil.');
    await page.setViewportSize({ width: 360, height: 740 });
    const { orderId } = await prepareOrder(page, ['E2E Gaseosa']);
    await login(page, 'cashier');
    await page.goto('/caja');
    await page.getByRole('link', { name: new RegExp(`Pedido #${orderId}`) }).click();
    await noHorizontalOverflow(page);
    await expect(page.getByText('S/ 4,00')).toBeVisible();
    await page.getByLabel('Medio de pago').selectOption('yape');
    await page.getByRole('button', { name: /revisar cobro/i }).click();
    await expect(page.getByRole('dialog')).toContainText(/confirmo que recibí el pago/i);
    const confirm = page.getByRole('button', { name: /confirmar cobro/i });
    await expect(confirm).toBeDisabled();
    await page.getByLabel(/confirmo que recibí el pago/i).check();

    const attempts: { key: string | null; body: string | null }[] = [];
    let committedResponse: { status: number; body: string } | undefined;
    await page.route(`**/api/orders/${orderId}/payments`, async (route) => {
      const request = route.request();
      attempts.push({
        key: request.headers()['idempotency-key'] ?? null,
        body: request.postData(),
      });
      const response = await route.fetch();
      if (attempts.length === 1) {
        committedResponse = { status: response.status(), body: await response.text() };
        await route.abort('connectionreset');
        return;
      }
      await route.fulfill({ response });
    });
    await confirm.click();
    await expect(page.getByRole('button', { name: /reintentar solicitud/i })).toBeVisible();
    expect(committedResponse?.status).toBe(201);
    await page.getByRole('button', { name: /reintentar solicitud/i }).click();
    await expect(page).toHaveURL(/\/caja\/pagos\/\d+$/);
    expect(attempts).toHaveLength(2);
    expect(attempts[0]?.key).toBeTruthy();
    expect(attempts[1]).toEqual(attempts[0]);
    expect(committedResponse).toBeDefined();
    const committed = JSON.parse(committedResponse!.body) as { payment: { id: number } };
    await expect(page).toHaveURL(new RegExp(`/caja/pagos/${committed.payment.id}$`));
    await expect(
      page.getByRole('region', { name: 'Pago confirmado' }).getByText('S/ 0,00'),
    ).toBeVisible();
    await noHorizontalOverflow(page);
  });
});
