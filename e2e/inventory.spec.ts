// AC-15: rutas reales de inventario, envío de mozo, caja y recuperación móvil del ACK.
import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

async function login(page: Page, role: 'waiter' | 'cashier' | 'admin' | 'second-waiter') {
  await page.request.post('/api/auth/logout');
  await page.goto('/login');
  const identity =
    role === 'waiter'
      ? { user: 'Mozo E2E', username: 'e2e.mozo', pin: '2468' }
      : role === 'second-waiter'
        ? { user: 'Gestión E2E Dos', username: 'e2e.gestion2', pin: '5926' }
        : role === 'cashier'
          ? { user: 'Caja E2E', username: 'e2e.caja', pin: '1357' }
          : { user: 'Admin E2E', username: 'e2e.admin', pin: '135790' };
  const target = page.getByRole('button', {
    name: `${identity.user} ${identity.username}`,
    exact: true,
  });
  const changeUser = page.getByRole('button', { name: 'Cambiar usuario', exact: true });
  await expect(target.or(changeUser)).toBeVisible();
  if (await changeUser.isVisible()) await changeUser.click();
  await target.click();
  for (const digit of identity.pin)
    await page.getByRole('button', { name: digit, exact: true }).click();
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(
    role === 'admin' ? /\/areas$/ : role === 'cashier' ? /\/caja$/ : /\/mozo$/,
  );
}

async function setInventory(
  request: APIRequestContext,
  {
    chickens = 0,
    productId,
    drinks = 1,
  }: { chickens?: number; productId: number; drinks?: number },
) {
  if (chickens > 0) {
    const enabled = await request.put('/api/inventory/chicken/control', {
      headers: { 'Idempotency-Key': randomUUID() },
      data: { enabled: true, reason: 'Preparación E2E' },
    });
    expect(enabled.status()).toBe(200);
    const batch = await request.post('/api/inventory/chicken/batches', {
      headers: { 'Idempotency-Key': randomUUID() },
      data: { chickens, reason: 'Tanda E2E' },
    });
    expect(batch.status()).toBe(201);
  }
  const enabledDrink = await request.put(`/api/inventory/drinks/${productId}/control`, {
    headers: { 'Idempotency-Key': randomUUID() },
    data: { enabled: true, reason: 'Preparación E2E' },
  });
  expect(enabledDrink.status()).toBe(200);
  const receipt = await request.post(`/api/inventory/drinks/${productId}/receipts`, {
    headers: { 'Idempotency-Key': randomUUID() },
    data: { quantity: drinks, reason: 'Entrada E2E' },
  });
  expect(receipt.status()).toBe(201);
}

async function productId(request: APIRequestContext, name: string): Promise<number> {
  const response = await request.get('/api/menu');
  expect(response.ok()).toBe(true);
  const { products } = (await response.json()) as { products: { id: number; name: string }[] };
  const found = products.find((product) => product.name === name);
  expect(found, `producto ${name}`).toBeTruthy();
  return found!.id;
}

async function makeTable(request: APIRequestContext, name: string): Promise<number> {
  const response = await request.post('/api/tables', { data: { name } });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { id: number }).id;
}

async function openOrder(request: APIRequestContext, tableId: number): Promise<number> {
  const response = await request.post(`/api/tables/${tableId}/orders`, { data: {} });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { id: number }).id;
}

async function consumptionMovements(request: APIRequestContext) {
  const response = await request.get('/api/inventory/movements');
  expect(response.status()).toBe(200);
  return (
    (await response.json()) as { movements: { type: string; ticketId: number | null }[] }
  ).movements.filter((movement) => movement.type === 'consumption');
}

test.describe('015: inventario en operación real', () => {
  test('AC-15: admin prepara saldo, mozo envía mezcla, caja no vuelve a consumir y otro mozo ve agotado', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chrome', 'Recorrido integrado de escritorio.');
    await login(page, 'admin');
    const drinkId = await productId(page.request, 'E2E Gaseosa');
    await setInventory(page.request, { chickens: 1, productId: drinkId, drinks: 1 });
    const tableId = await makeTable(page.request, `E2E Inventario ${randomUUID().slice(0, 6)}`);
    const nextTable = await makeTable(page.request, `E2E Agotado ${randomUUID().slice(0, 6)}`);

    await login(page, 'waiter');
    const orderId = await openOrder(page.request, tableId);
    await page.goto(`/mozo/mesas/${tableId}/agregar`);
    await expect(page.getByRole('heading', { name: 'Agregar ítems' })).toBeVisible();
    await page.getByRole('button', { name: /E2E Pollo/ }).click();
    await page.getByRole('combobox', { name: 'Presentación' }).selectOption({ label: 'Cuarto' });
    await page.getByRole('combobox', { name: 'Parte' }).selectOption({ label: 'Pierna' });
    await page.getByRole('button', { name: 'Agregar al pedido' }).click();
    await page.getByRole('button', { name: /E2E Gaseosa/ }).click();
    await page.getByRole('button', { name: 'Agregar al pedido' }).click();
    await page.getByRole('button', { name: /Enviar a cocina \(2\)/ }).click();
    await expect(page).toHaveURL(new RegExp(`/mozo/mesas/${tableId}$`));
    const sentMovements = await consumptionMovements(page.request);
    expect(sentMovements).toHaveLength(2);
    const ticketId = sentMovements[0]!.ticketId;
    expect(ticketId).toBeTruthy();

    await login(page, 'admin');
    expect(await consumptionMovements(page.request)).toHaveLength(2);
    await login(page, 'cashier');
    await page.goto('/caja');
    await page.getByRole('link', { name: new RegExp(`Pedido #${orderId}`) }).click();
    await page.getByLabel(/monto recibido \(s\/\)/i).fill('69');
    await page.getByRole('button', { name: /revisar cobro/i }).click();
    await page.getByRole('button', { name: /confirmar cobro/i }).click();
    await expect(page).toHaveURL(/\/caja\/pagos\/\d+$/);
    await login(page, 'admin');
    expect(await consumptionMovements(page.request)).toHaveLength(2);

    await login(page, 'second-waiter');
    await openOrder(page.request, nextTable);
    await page.goto(`/mozo/mesas/${nextTable}/agregar`);
    await expect(page.getByRole('heading', { name: 'Agregar ítems' })).toBeVisible();
    await expect(page.getByText(/agota|sin stock/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /E2E Gaseosa/ })).toBeDisabled();
    expect(await consumptionMovements(page.request)).toHaveLength(2);
    expect(sentMovements.every((movement) => movement.ticketId === ticketId)).toBe(true);
  });

  test('AC-15: en móvil, perder el cuerpo tras un 201 real permite reintentar con la misma clave', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chrome', 'Recorrido de recuperación en móvil.');
    await page.setViewportSize({ width: 360, height: 740 });
    await login(page, 'admin');
    const drinkId = await productId(page.request, 'E2E Gaseosa');
    await setInventory(page.request, { productId: drinkId, drinks: 1 });
    const tableId = await makeTable(page.request, `E2E ACK inventario ${randomUUID().slice(0, 6)}`);
    await login(page, 'waiter');
    const orderId = await openOrder(page.request, tableId);
    await page.goto(`/mozo/mesas/${tableId}/agregar`);
    await expect(page.getByRole('heading', { name: 'Agregar ítems' })).toBeVisible();
    await page.getByRole('button', { name: /E2E Gaseosa/ }).click();
    await page.getByRole('button', { name: 'Agregar al pedido' }).click();

    const attempts: Array<{ key: string | null; body: string | null }> = [];
    let committed: { status: number; body: string } | undefined;
    await page.route(`**/api/orders/${orderId}/items`, async (route) => {
      const request = route.request();
      attempts.push({
        key: request.headers()['idempotency-key'] ?? null,
        body: request.postData(),
      });
      const response = await route.fetch();
      if (attempts.length === 1) {
        committed = { status: response.status(), body: await response.text() };
        await route.abort('connectionreset');
        return;
      }
      await route.fulfill({ response });
    });
    await page.getByRole('button', { name: /Enviar a cocina \(1\)/ }).click();
    await expect(page.getByRole('button', { name: /Reintentar envío/i })).toBeVisible();
    expect(committed?.status).toBe(201);
    await page.getByRole('button', { name: /Reintentar envío/i }).click();
    await expect(page).toHaveURL(new RegExp(`/mozo/mesas/${tableId}$`));
    expect(attempts).toHaveLength(2);
    expect(attempts[0]?.key).toBeTruthy();
    expect(attempts[1]).toEqual(attempts[0]);

    await login(page, 'admin');
    const order = await page.request.get(`/api/orders/${orderId}`);
    expect(order.status()).toBe(200);
    expect(((await order.json()) as { items: unknown[] }).items).toHaveLength(1);
    const consumed = await consumptionMovements(page.request);
    expect(consumed).toHaveLength(1);
    expect(consumed[0]?.ticketId).toBeTruthy();
  });
});
