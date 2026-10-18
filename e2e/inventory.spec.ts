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
  productId: number,
  includeChicken: boolean,
) {
  if (includeChicken) {
    const enabled = await request.put('/api/inventory/chicken/control', {
      headers: { 'Idempotency-Key': randomUUID() },
      data: { enabled: true, reason: 'Preparación E2E' },
    });
    expect(enabled.status()).toBe(200);
  }
  const enabledDrink = await request.put(`/api/inventory/drinks/${productId}/control`, {
    headers: { 'Idempotency-Key': randomUUID() },
    data: { enabled: true, reason: 'Preparación E2E' },
  });
  expect(enabledDrink.status()).toBe(200);
}

async function enterStockThroughAdminUi(page: Page, chickens: number, drinks: number) {
  await page.goto('/admin/inventario');
  await expect(page.getByRole('heading', { name: 'Inventario', level: 1 })).toBeVisible();
  if (chickens > 0) {
    await page.getByRole('button', { name: /registrar tanda/i }).click();
    await page.getByLabel(/pollos/i).fill(String(chickens));
    await page.getByLabel(/motivo/i).fill('Tanda E2E');
    await page.getByRole('button', { name: /revisar/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /confirmar.*tanda|registrar.*tanda/i }).click();
    await expect(page.getByText(/tanda registrada/i)).toBeVisible();
  }
  await page.getByRole('button', { name: /registrar entrada/i }).click();
  await page.getByLabel(/unidades/i).fill(String(drinks));
  await page.getByLabel(/motivo/i).fill('Entrada E2E');
  await page.getByRole('button', { name: /revisar/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /confirmar.*entrada|registrar.*entrada/i }).click();
  await expect(page.getByText(/entrada registrada/i)).toBeVisible();
}

async function closeInventoryControls(
  request: APIRequestContext,
  drinkId: number,
  chicken: boolean,
) {
  if (chicken) {
    const response = await request.put('/api/inventory/chicken/control', {
      headers: { 'Idempotency-Key': randomUUID() },
      data: { enabled: false, reason: 'Cierre E2E' },
    });
    expect(response.status()).toBe(200);
  }
  const response = await request.put(`/api/inventory/drinks/${drinkId}/control`, {
    headers: { 'Idempotency-Key': randomUUID() },
    data: { enabled: false, reason: 'Cierre E2E' },
  });
  expect(response.status()).toBe(200);
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

async function firstTicketId(request: APIRequestContext, orderId: number): Promise<number> {
  const response = await request.get(`/api/orders/${orderId}/tickets`);
  expect(response.status()).toBe(200);
  const { tickets } = (await response.json()) as { tickets: { id: number }[] };
  const ticketId = tickets[0]?.id;
  if (ticketId === undefined) throw new Error(`No se creó una comanda para el pedido ${orderId}.`);
  return ticketId;
}

async function consumptionMovements(request: APIRequestContext, ticketId?: number) {
  const movements: { type: string; ticketId: number | null }[] = [];
  let afterId: number | undefined;
  do {
    const query = afterId === undefined ? '' : `?afterId=${afterId}`;
    const response = await request.get(`/api/inventory/movements${query}`);
    expect(response.status()).toBe(200);
    const page = (await response.json()) as {
      movements: { type: string; ticketId: number | null }[];
      nextAfterId: number | null;
    };
    movements.push(...page.movements);
    afterId = page.nextAfterId ?? undefined;
  } while (afterId !== undefined);
  return movements.filter(
    (movement) =>
      movement.type === 'consumption' && (ticketId === undefined || movement.ticketId === ticketId),
  );
}

test.describe('015: inventario en operación real', () => {
  test('AC-15: admin prepara saldo, mozo envía mezcla, caja no vuelve a consumir y otro mozo ve agotado', async ({
    page,
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chrome', 'Recorrido integrado de escritorio.');
    const adminContext = await browser.newContext({ baseURL: 'http://localhost:3100' });
    const adminPage = await adminContext.newPage();
    let drinkId: number | undefined;
    try {
      await login(adminPage, 'admin');
      drinkId = await productId(adminPage.request, 'E2E Gaseosa');
      await setInventory(adminPage.request, drinkId, true);
      await enterStockThroughAdminUi(adminPage, 1, 1);
      const tableId = await makeTable(
        adminPage.request,
        `E2E Inventario ${randomUUID().slice(0, 6)}`,
      );
      const nextTable = await makeTable(
        adminPage.request,
        `E2E Agotado ${randomUUID().slice(0, 6)}`,
      );

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
      const ticketId = await firstTicketId(page.request, orderId);
      const ticketMovements = await consumptionMovements(adminPage.request, ticketId);
      expect(ticketMovements).toHaveLength(2);

      await login(page, 'cashier');
      await page.goto('/caja');
      await page.getByRole('link', { name: new RegExp(`Pedido #${orderId}`) }).click();
      await page.getByLabel(/monto recibido \(s\/\)/i).fill('69');
      await page.getByRole('button', { name: /revisar cobro/i }).click();
      await page.getByRole('button', { name: /confirmar cobro/i }).click();
      await expect(page).toHaveURL(/\/caja\/pagos\/\d+$/);
      expect(await consumptionMovements(adminPage.request, ticketId)).toHaveLength(2);

      await login(page, 'second-waiter');
      await openOrder(page.request, nextTable);
      await page.goto(`/mozo/mesas/${nextTable}/agregar`);
      await expect(page.getByRole('heading', { name: 'Agregar ítems' })).toBeVisible();
      await expect(page.getByText(/agota|sin stock/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /E2E Gaseosa/ })).toBeDisabled();
      expect(await consumptionMovements(adminPage.request, ticketId)).toHaveLength(2);
    } finally {
      if (drinkId !== undefined)
        await closeInventoryControls(adminPage.request, drinkId, true).catch(() => undefined);
      await adminContext.close();
    }
  });

  test('AC-15: en móvil, perder el cuerpo tras un 201 real permite reintentar con la misma clave', async ({
    page,
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chrome', 'Recorrido de recuperación en móvil.');
    await page.setViewportSize({ width: 360, height: 740 });
    const adminContext = await browser.newContext({ baseURL: 'http://localhost:3100' });
    const adminPage = await adminContext.newPage();
    let drinkId: number | undefined;
    try {
      await login(adminPage, 'admin');
      drinkId = await productId(adminPage.request, 'E2E Gaseosa');
      await setInventory(adminPage.request, drinkId, false);
      await enterStockThroughAdminUi(adminPage, 0, 1);
      const tableId = await makeTable(
        adminPage.request,
        `E2E ACK inventario ${randomUUID().slice(0, 6)}`,
      );
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
      const ticketId = await firstTicketId(page.request, orderId);
      const consumed = await consumptionMovements(page.request, ticketId);
      expect(consumed).toHaveLength(1);
    } finally {
      if (drinkId !== undefined)
        await closeInventoryControls(adminPage.request, drinkId, false).catch(() => undefined);
      await adminContext.close();
    }
  });
});
