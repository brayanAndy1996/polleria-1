// AC-22, AC-23 y AC-24. Spec 011 — los tres recorridos del mozo en mobile-chrome
// (360×740) sobre polleria_test con la semilla de D-011-16. Van EN ROJO: las
// pantallas /mozo, /mozo/mesas/[tableId] y .../agregar no existen todavía.
import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

async function enterPin(page: Page, pin: string): Promise<void> {
  for (const digit of pin) await page.getByRole('button', { name: digit, exact: true }).click();
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}
async function expectNoOverflow(page: Page): Promise<void> {
  const fits = await page.evaluate<boolean>(
    'document.documentElement.scrollWidth <= window.innerWidth',
  );
  expect(fits).toBe(true);
}
async function loginAsWaiter(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: /^Mozo E2E/ }).click();
  await enterPin(page, '2468');
  await expect(page).toHaveURL(/\/mozo$/, { timeout: 10000 });
}
async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: /^Admin E2E/ }).click();
  await enterPin(page, '135790');
  await expect(page).toHaveURL(/\/areas$/, { timeout: 10000 });
  await page.getByRole('navigation', { name: 'Áreas' }).getByRole('link', { name: 'Mozo' }).click();
  await expect(page).toHaveURL(/\/mozo$/);
}
/** Id de la mesa sembrada consultando el salón con la sesión del navegador. */
async function tableIdByName(request: APIRequestContext, name: string): Promise<number> {
  const response = await request.get('/api/tables');
  expect(response.ok()).toBe(true);
  const { tables } = (await response.json()) as { tables: { id: number; name: string }[] };
  const found = tables.find((table) => table.name === name);
  expect(found, `mesa ${name} en el salón`).toBeTruthy();
  return found!.id;
}
async function productIdByName(request: APIRequestContext, name: string): Promise<number> {
  const response = await request.get('/api/menu');
  expect(response.ok()).toBe(true);
  const { products } = (await response.json()) as { products: { id: number; name: string }[] };
  const found = products.find((product) => product.name === name);
  expect(found, `producto ${name} en la carta`).toBeTruthy();
  return found!.id;
}
/** Abre la mesa por API para preparar el recorrido (la apertura por UI la cubre E2E-1). */
async function openOrder(request: APIRequestContext, tableName: string): Promise<number> {
  const tableId = await tableIdByName(request, tableName);
  const response = await request.post(`/api/tables/${tableId}/orders`, { data: {} });
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { id: number }).id;
}
/** Envía una tanda por API con su Idempotency-Key, para preparar un pedido con ítems. */
async function sendItems(
  request: APIRequestContext,
  orderId: number,
  items: { productId: number; quantity: number; portion?: string; cut?: string }[],
): Promise<void> {
  const response = await request.post(`/api/orders/${orderId}/items`, {
    headers: { 'Idempotency-Key': randomUUID() },
    data: { items },
  });
  expect(response.ok()).toBe(true);
}
/** Tarjeta del tablero: el enlace que lleva el nombre de la mesa. */
function tableCard(page: Page, name: string) {
  return page.getByRole('link', { name: new RegExp(name) });
}
/** Sección 'Pedido' de la página de mesa: los ítems enviados viven ahí; las
 * comandas (donde se repite el nombre de un componente de combo) van aparte. */
function sentItems(page: Page) {
  return page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Pedido', exact: true, level: 2 }) });
}
/** Listitem de un ítem suelto del pedido: su línea lleva ' · S/'. Los
 * componentes de un combo (en un <ul> anidado) no traen precio, así el ítem
 * 'E2E Chaufa' no confunde con el componente de 'E2E Mostrito'. */
function sentItem(page: Page, name: string) {
  return sentItems(page)
    .getByRole('listitem')
    .filter({ hasText: new RegExp(`${name} · S/`) });
}

test.describe('011: pantallas del mozo en el celular', () => {
  test('AC-22: abrir la mesa, enviar una tanda mixta y las señales listo/servido/cuenta', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chrome', 'Solo aplica a mobile-chrome.');
    await loginAsWaiter(page);
    await expectNoOverflow(page);
    // Abre 'E2E Mesa 1' desde el tablero.
    await tableCard(page, 'E2E Mesa 1').click();
    await expect(page.getByRole('heading', { name: 'E2E Mesa 1', level: 1 })).toBeVisible();
    await expect(page.getByText('Libre')).toBeVisible();
    await page.getByRole('button', { name: 'Abrir mesa' }).click();
    await expect(page.getByText('Todavía no hay ítems enviados.')).toBeVisible();
    await expectNoOverflow(page);
    // Tanda mixta: cuarto pierna con crema y observación + una bebida.
    await page.getByRole('link', { name: 'Agregar ítems' }).click();
    await expect(page.getByRole('heading', { name: 'Agregar ítems', level: 1 })).toBeVisible();
    await expectNoOverflow(page);
    await page.getByRole('button', { name: /^E2E Pollo/ }).click();
    await expect(page.getByRole('combobox', { name: 'Presentación' })).toBeVisible();
    await page.getByRole('checkbox', { name: 'E2E Ají' }).check();
    await page.getByLabel('Observación').fill('sin ensalada');
    await page.getByRole('button', { name: 'Agregar al pedido' }).click();
    await page.getByRole('button', { name: /^E2E Gaseosa/ }).click();
    await page.getByRole('button', { name: 'Agregar al pedido' }).click();
    await page.getByRole('button', { name: 'Enviar a cocina (2)' }).click();
    // De vuelta en la mesa: aviso, ítems y total (1700 + 0 + 400).
    await expect(page.getByText('Pedido enviado a cocina.')).toBeVisible();
    await expect(sentItems(page).getByText(/E2E Pollo — Cuarto — pierna/)).toBeVisible();
    await expect(sentItems(page).getByText(/E2E Gaseosa/)).toBeVisible();
    await expect(page.getByText('Total S/ 21.00')).toBeVisible();
    await expect(page.getByText('Comanda inicial')).toBeVisible();
    await expectNoOverflow(page);
    // Señales del ciclo: listo (el tablero lo refleja), servido y cuenta.
    await page.getByRole('button', { name: 'Marcar pedido listo' }).click();
    await expect(page.getByText('Pedido listo')).toBeVisible();
    await page.goto('/mozo');
    await expect(tableCard(page, 'E2E Mesa 1').getByText('Pedido listo')).toBeVisible();
    await tableCard(page, 'E2E Mesa 1').click();
    await page.getByRole('button', { name: 'Marcar servido' }).click();
    await expect(page.getByText('Ocupada')).toBeVisible();
    await page.getByRole('button', { name: 'Pedir la cuenta' }).click();
    await expect(page.getByText(/Pidió la cuenta/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pedir la cuenta' })).toHaveCount(0);
    await expectNoOverflow(page);
  });

  test('AC-23: una segunda tanda crea Adición y la anulación se resuelve entre mozo y admin', async ({
    page,
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chrome', 'Solo aplica a mobile-chrome.');
    await loginAsWaiter(page);
    // Pedido con una primera tanda enviada por API (el pedido "ya tiene ítems").
    const orderId = await openOrder(page.request, 'E2E Mesa 2');
    const gaseosaId = await productIdByName(page.request, 'E2E Gaseosa');
    const chaufaId = await productIdByName(page.request, 'E2E Chaufa');
    await sendItems(page.request, orderId, [{ productId: gaseosaId, quantity: 1 }]);
    // El mozo agrega una segunda tanda por la interfaz: el mostrito.
    await tableCard(page, 'E2E Mesa 2').click();
    await page.getByRole('link', { name: 'Agregar ítems' }).click();
    await page.getByRole('button', { name: /^E2E Mostrito/ }).click();
    await page.getByRole('button', { name: 'Agregar al pedido' }).click();
    await page.getByRole('button', { name: 'Enviar a cocina (1)' }).click();
    await expect(page.getByText('Adición')).toBeVisible();
    await expectNoOverflow(page);
    // Solicita la anulación de la gaseosa con motivo.
    await sentItem(page, 'E2E Gaseosa')
      .getByRole('button', { name: 'Solicitar anulación' })
      .click();
    await page.getByLabel('Motivo de la anulación').fill('El cliente se equivocó');
    await page.getByRole('button', { name: 'Aceptar' }).click();
    await expect(page.getByText('Anulación pedida')).toBeVisible();
    // Segunda sesión del admin: el tablero marca la solicitud y él la aprueba.
    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await loginAsAdmin(admin);
    await expect(tableCard(admin, 'E2E Mesa 2').getByText('Anulación pedida')).toBeVisible();
    await tableCard(admin, 'E2E Mesa 2').click();
    await admin.getByRole('button', { name: 'Aprobar anulación' }).click();
    await expect(admin.getByLabel('Motivo de la anulación')).toHaveValue('El cliente se equivocó');
    await admin.getByLabel('Motivo de la anulación').fill('Salió mal la bebida');
    await admin.getByRole('button', { name: 'Aceptar' }).click();
    await expect(admin.getByText('Anulado')).toBeVisible();
    await expect(admin.getByText('Total S/ 22.00')).toBeVisible();
    await expectNoOverflow(admin);
    // El mozo envía una tercera tanda y pide anular el chaufa; el admin rechaza.
    await page.getByRole('link', { name: 'Agregar ítems' }).click();
    await page.getByRole('button', { name: /^E2E Chaufa/ }).click();
    await page.getByRole('button', { name: 'Agregar al pedido' }).click();
    await page.getByRole('button', { name: 'Enviar a cocina (1)' }).click();
    await sentItem(page, 'E2E Chaufa').getByRole('button', { name: 'Solicitar anulación' }).click();
    await page.getByLabel('Motivo de la anulación').fill('Se pidió dos veces');
    await page.getByRole('button', { name: 'Aceptar' }).click();
    await expect(page.getByText('Anulación pedida')).toBeVisible();
    await admin.reload();
    await admin.getByRole('button', { name: 'Rechazar solicitud' }).click();
    await expect(admin.getByText(/¿Rechazar la anulación que pidió Mozo E2E\?/)).toBeVisible();
    await admin.getByRole('button', { name: 'Sí, rechazar' }).click();
    // El ítem vuelve a 'Enviado': sin marca y con 'Anular' otra vez disponible.
    await expect(admin.getByRole('button', { name: 'Rechazar solicitud' })).toHaveCount(0);
    await expect(
      sentItem(admin, 'E2E Chaufa').getByRole('button', { name: 'Anular', exact: true }),
    ).toBeVisible();
    await adminContext.close();
    void sendItems; // la tanda de preparación ya se envió arriba
    void chaufaId;
  });

  test('AC-24: mover a otra mesa, unir, separar y cancelar con motivo', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chrome', 'Solo aplica a mobile-chrome.');
    await loginAsWaiter(page);
    // Mesas "limpias" para este escenario: AC-22 dejó la 1 ocupada y AC-23 la 2,
    // así que el pedido vacío (condición para cancelarlo) arranca en la 3, se
    // mueve a la 5 libre y une la 4 (también con pedido vacío).
    await openOrder(page.request, 'E2E Mesa 3');
    await openOrder(page.request, 'E2E Mesa 4');
    await page.goto('/mozo');
    await tableCard(page, 'E2E Mesa 3').click();
    // Mover el pedido vacío a 'E2E Mesa 5' (única libre que no toca este test).
    await page.getByRole('button', { name: 'Mover a otra mesa' }).click();
    await page.getByRole('combobox').selectOption({ label: 'E2E Mesa 5' });
    await page.getByRole('button', { name: /^(Mover|Sí, mover)$/ }).click();
    await expect(page.getByRole('heading', { name: 'E2E Mesa 5', level: 1 })).toBeVisible();
    await expectNoOverflow(page);
    // La mesa 3 quedó libre.
    await page.goto('/mozo');
    await expect(tableCard(page, 'E2E Mesa 3').getByText('Libre')).toBeVisible();
    await tableCard(page, 'E2E Mesa 5').click();
    // Unir 'E2E Mesa 4' a la cuenta: la vista muestra la mesa unida.
    await page.getByRole('button', { name: 'Unir mesa' }).click();
    await page.getByRole('combobox').selectOption({ label: 'E2E Mesa 4' });
    await page.getByRole('button', { name: /^(Unir|Sí, unir)$/ }).click();
    await expect(page.getByText('y E2E Mesa 4')).toBeVisible();
    // Separarla con su confirmación.
    await page.getByRole('button', { name: 'Separar E2E Mesa 4' }).click();
    await expect(page.getByText('¿Separar E2E Mesa 4? Quedará libre.')).toBeVisible();
    await page.getByRole('button', { name: 'Sí, separar' }).click();
    await expect(page.getByText('y E2E Mesa 4')).toHaveCount(0);
    await page.goto('/mozo');
    await expect(tableCard(page, 'E2E Mesa 4').getByText('Libre')).toBeVisible();
    // Cancelar el pedido (sin ítems) con su motivo y de vuelta al tablero.
    await tableCard(page, 'E2E Mesa 5').click();
    await page.getByRole('button', { name: 'Cancelar pedido' }).click();
    await page.getByLabel('Motivo de la cancelación').fill('Se fueron sin pedir');
    await page.getByRole('button', { name: 'Aceptar' }).click();
    await expect(page).toHaveURL(/\/mozo$/);
    await expect(tableCard(page, 'E2E Mesa 5').getByText('Libre')).toBeVisible();
    await expectNoOverflow(page);
  });
});
