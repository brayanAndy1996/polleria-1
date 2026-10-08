import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function enterPin(page: Page, pin: string): Promise<void> {
  for (const digit of pin) await page.getByRole('button', { name: digit, exact: true }).click();
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}
async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: /^Admin E2E/ }).click();
  await enterPin(page, '135790');
  await expect(page).toHaveURL(/\/areas$/, { timeout: 10000 });
}
async function goToAdmin(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: '\u00C1reas' })
    .getByRole('link', { name: 'Administraci\u00F3n' })
    .click();
  await expect(page).toHaveURL(/\/admin$/);
}
/** Devuelve el id de un usuario consultando la lista real con la sesión del navegador. */
async function userIdByUsername(page: Page, username: string): Promise<number> {
  const response = await page.request.get('/api/users');
  expect(response.ok()).toBe(true);
  const { users } = (await response.json()) as {
    users: { id: number; username: string }[];
  };
  const found = users.find((user) => user.username === username);
  expect(found, `usuario ${username} en la lista`).toBeTruthy();
  return found!.id;
}

test.describe('004: gestión de usuarios desde la web', () => {
  test('AC-26: el administrador crea un mozo y el mozo entra con su PIN', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chrome', 'Solo aplica a desktop-chrome.');
    await loginAsAdmin(page);
    await goToAdmin(page);
    await page.getByRole('link', { name: 'Usuarios' }).click();
    await expect(page).toHaveURL(/\/admin\/usuarios$/);
    await expect(page.getByRole('heading', { name: 'Usuarios', level: 1 })).toBeVisible();
    await page.getByRole('link', { name: 'Agregar usuario' }).click();
    await expect(page).toHaveURL(/\/admin\/usuarios\/nuevo$/);
    await page.getByLabel('Nombre de usuario').fill('e2e.gestion');
    await page.getByLabel('Nombre para mostrar').fill('Gesti\u00F3n E2E');
    await page.getByLabel('PIN', { exact: true }).fill('3968');
    await page.getByLabel('Repetir PIN').fill('3968');
    await page.getByRole('checkbox', { name: 'Mozo' }).check();
    await page.getByRole('button', { name: 'Crear usuario' }).click();
    await expect(page).toHaveURL(/\/admin\/usuarios$/, { timeout: 10000 });
    await expect(page.getByText('Gesti\u00F3n E2E', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar sesi\u00F3n' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByRole('button', { name: /^Gesti\u00F3n E2E(?! Dos)/ }).click();
    await enterPin(page, '3968');
    await expect(page).toHaveURL(/\/mozo$/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Mozo', exact: true })).toBeVisible();
  });

  test('AC-27: desactivar quita al mozo de /login y reactivar lo devuelve', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chrome', 'Solo aplica a desktop-chrome.');
    await page.goto('/login');
    await expect(
      page.getByRole('button', { name: /^Gesti\u00F3n E2E Dos/ }),
    ).toBeVisible();
    await loginAsAdmin(page);
    await goToAdmin(page);
    const gestion2Id = await userIdByUsername(page, 'e2e.gestion2');
    await page.goto(`/admin/usuarios/${gestion2Id}`);
    await page.getByRole('button', { name: 'Desactivar' }).click();
    await page.getByRole('button', { name: 'S\u00ED, desactivar' }).click();
    await expect(page.getByText('Desactivado')).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar sesi\u00F3n' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: /^Gesti\u00F3n E2E Dos/ })).toHaveCount(0);
    await page.getByRole('button', { name: /^Admin E2E/ }).click();
    await enterPin(page, '135790');
    await expect(page).toHaveURL(/\/areas$/, { timeout: 10000 });
    await page.goto(`/admin/usuarios/${gestion2Id}`);
    await page.getByRole('button', { name: 'Activar' }).click();
    await page.getByRole('button', { name: 'Cerrar sesi\u00F3n' }).click();
    await expect(page).toHaveURL(/\/login$/);
    const gestion2 = page.getByRole('button', { name: /^Gesti\u00F3n E2E Dos/ });
    await expect(gestion2).toBeVisible();
    await gestion2.click();
    await enterPin(page, '5926');
    await expect(page).toHaveURL(/\/mozo$/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Mozo', exact: true })).toBeVisible();
  });
});
