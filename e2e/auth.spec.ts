import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

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
async function expectTouchTargets(page: Page, expectedCount?: number): Promise<void> {
  const buttons = page.getByRole('main').getByRole('button');
  if (expectedCount !== undefined) await expect(buttons).toHaveCount(expectedCount);
  for (const button of await buttons.all()) {
    await expect(button).toBeVisible();
    const bounds = await button.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(48);
  }
}

test.describe('003: inicio de sesión y áreas', () => {
  test('AC-37: un mozo entra, recarga, sale y no vuelve sin PIN', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /^Mozo E2E/ }).click();
    await enterPin(page, '2468');
    await expect(page).toHaveURL(/\/mozo$/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Mesas', exact: true })).toBeVisible();
    await expect(page.getByText('Mozo E2E · Mozo', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Mesas', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/mozo');
    await expect(page).toHaveURL(/\/login$/, { timeout: 10000 });
  });
  test('AC-38: el administrador entra a todas las áreas pero un PIN incorrecto no', async ({
    page,
    context,
  }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /^Admin E2E/ }).click();
    await enterPin(page, '111111');
    const invalidCredentialsAlert = page.getByRole('main').getByRole('alert');
    await expect(invalidCredentialsAlert).toHaveCount(1);
    await expect(invalidCredentialsAlert).toHaveText('Usuario o PIN incorrecto.');
    await expect(invalidCredentialsAlert).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    await enterPin(page, '135790');
    await expect(page).toHaveURL(/\/areas$/);
    await expect(page.getByRole('heading', { name: '¿Dónde vas a trabajar?' })).toBeVisible();
    const areas = page.getByRole('navigation', { name: 'Áreas' });
    await expect(areas.getByRole('link')).toHaveText(['Mozo', 'Caja', 'Cocina', 'Administración']);
    await areas.getByRole('link', { name: 'Administración' }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(
      page.getByRole('heading', { name: 'Administración', exact: true, level: 1 }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Cambiar de área' }).click();
    await page
      .getByRole('navigation', { name: 'Áreas' })
      .getByRole('link', { name: 'Caja', exact: true })
      .click();
    await expect(page).toHaveURL(/\/caja$/);
    await expect(page.getByRole('heading', { name: 'Caja' })).toBeVisible();
    const cookie = (await context.cookies()).find((item) => item.name === 'polleria_session');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', secure: false });
  });
  test('AC-39: el teclado tiene objetivos táctiles de 48 px y no usa recursos externos', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chrome', 'Solo aplica al proyecto mobile-chrome.');
    const urls: string[] = [];
    page.on('request', (request) => {
      urls.push(request.url());
    });
    page.on('websocket', (socket) => {
      urls.push(socket.url());
    });
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: '¿Quién eres?' })).toBeVisible();
    // Conteo dinámico: la 004 siembra más usuarios; se exige a los cuatro de la 003 y 48 px a todos.
    for (const name of ['Mozo E2E', 'Caja E2E', 'Admin E2E', 'Mozo Caja E2E'])
      await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible();
    await expectTouchTargets(page);
    await expectNoOverflow(page);
    await page.getByRole('button', { name: /^Mozo E2E/ }).click();
    await expectTouchTargets(page, 13);
    await expectNoOverflow(page);
    await enterPin(page, '2468');
    await expect(page.getByRole('heading', { name: 'Mesas', exact: true })).toBeVisible();
    await expectNoOverflow(page);
    expect(
      urls
        .filter((url) => !url.startsWith('data:') && !url.startsWith('blob:'))
        .filter((url) => new URL(url).host !== 'localhost:3100'),
    ).toEqual([]);
  });
  test('AC-44: una persona con dos roles elige, cambia y recuerda su última área', async ({
    page,
  }, testInfo) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /^Mozo Caja E2E/ }).click();
    await enterPin(page, '8642');
    await expect(page).toHaveURL(/\/areas$/, { timeout: 10000 });
    await expect(
      page.getByRole('heading', { name: '¿Dónde vas a trabajar?', level: 1 }),
    ).toBeVisible();
    const areas = page.getByRole('navigation', { name: 'Áreas' });
    await expect(areas.getByRole('link')).toHaveText(['Mozo', 'Caja']);
    if (testInfo.project.name === 'mobile-chrome') {
      for (const link of await areas.getByRole('link').all())
        expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(48);
      await expectNoOverflow(page);
    }
    await areas.getByRole('link', { name: 'Caja' }).click();
    await expect(page).toHaveURL(/\/caja$/);
    await expect(page.getByRole('heading', { name: 'Caja', exact: true, level: 1 })).toBeVisible();
    await expect(page.getByText('Mozo Caja E2E · Mozo, Cajero')).toBeVisible();
    await page.getByRole('link', { name: 'Cambiar de área' }).click();
    await page
      .getByRole('navigation', { name: 'Áreas' })
      .getByRole('link', { name: 'Mozo', exact: true })
      .click();
    await expect(page).toHaveURL(/\/mozo$/);
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page.getByRole('heading', { name: 'Hola, Mozo Caja E2E' })).toBeVisible();
    await enterPin(page, '8642');
    await expect(page).toHaveURL(/\/mozo$/);
    await expect(page.getByRole('heading', { name: 'Mesas', exact: true })).toBeVisible();
  });
});
