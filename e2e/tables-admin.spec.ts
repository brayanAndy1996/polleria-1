// AC-11. Spec 012 — el recorrido de administración de mesas en mobile-chrome
// (360×740) sobre polleria_test con la semilla vigente (D-012-11: usuarios,
// carta y 'E2E Mesa 1' a 'E2E Mesa 5' de la 011; sin cambios en global-setup).
// Va EN ROJO: la página /admin/mesas y el enlace 'Mesas' en /admin no existen.
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
async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: /^Admin E2E/ }).click();
  await enterPin(page, '135790');
  await expect(page).toHaveURL(/\/areas$/, { timeout: 10000 });
}
/** Entra a /admin/mesas por la navegación: /areas → Administración → 'Mesas'. */
async function goToTablesAdmin(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Áreas' })
    .getByRole('link', { name: 'Administración' })
    .click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('link', { name: 'Mesas' }).click();
  await expect(page).toHaveURL(/\/admin\/mesas$/);
}
/** Fila de la lista: el contenedor más cercano al nombre que tiene 'Renombrar'. */
function tableRow(page: Page, name: string) {
  return page.locator(
    `xpath=//*[normalize-space(text())=${JSON.stringify(
      name,
    )}]/ancestor::*[.//button[normalize-space()="Renombrar"]][1]`,
  );
}
/** Panel del renombrado: el contenedor del título que tiene 'Guardar'. */
function renamePanel(page: Page) {
  return page.locator(
    'xpath=//*[normalize-space(text())="Renombrar mesa"]/ancestor::*[.//button[normalize-space()="Guardar"]][1]',
  );
}

test.describe('012: administración de mesas en el celular', () => {
  test('AC-11: alta, renombrar, desactivar con confirmación, reactivar y nombre repetido', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chrome', 'Solo aplica a mobile-chrome.');
    await loginAsAdmin(page);
    await goToTablesAdmin(page);
    await expect(page.getByRole('heading', { name: 'Mesas', level: 1 })).toBeVisible();
    await expectNoOverflow(page);
    // Alta en línea: 'E2E Balcón' nace activa y libre en la lista releída.
    await page.getByLabel('Nombre de la mesa').fill('E2E Balcón');
    await page.getByRole('button', { name: 'Agregar mesa' }).click();
    const balcon = tableRow(page, 'E2E Balcón');
    await expect(balcon.getByText('Libre')).toBeVisible();
    await expect(page.getByLabel('Nombre de la mesa')).toHaveValue('');
    await expectNoOverflow(page);
    // Renombrar: diálogo con el nombre precargado → la fila muestra 'E2E Terraza'.
    await balcon.getByRole('button', { name: 'Renombrar' }).click();
    const panel = renamePanel(page);
    await expect(panel.getByLabel('Nombre de la mesa')).toHaveValue('E2E Balcón');
    await panel.getByLabel('Nombre de la mesa').fill('E2E Terraza');
    await panel.getByRole('button', { name: 'Guardar' }).click();
    const terraza = tableRow(page, 'E2E Terraza');
    await expect(terraza.getByText('Libre')).toBeVisible();
    // Desactivar con confirmación: sin etiqueta de estado y con 'Activar'.
    await terraza.getByRole('button', { name: 'Desactivar' }).click();
    await expect(page.getByText(/¿Desactivar E2E Terraza\?/)).toBeVisible();
    await page.getByRole('button', { name: 'Sí, desactivar' }).click();
    await expect(terraza.getByText('Desactivada')).toBeVisible();
    await expect(terraza.getByText('Libre')).toHaveCount(0);
    // Reactivar sin confirmación: vuelve activa y libre.
    await terraza.getByRole('button', { name: 'Activar' }).click();
    await expect(terraza.getByText('Libre')).toBeVisible();
    await expect(terraza.getByText('Desactivada')).toHaveCount(0);
    await expectNoOverflow(page);
    // Alta repetida con otras mayúsculas: el mensaje del servidor y el borrador queda.
    await page.getByLabel('Nombre de la mesa').fill('e2e TERRAZA');
    await page.getByRole('button', { name: 'Agregar mesa' }).click();
    await expect(page.getByText('Ya existe una mesa con ese nombre.')).toBeVisible();
    await expect(page.getByLabel('Nombre de la mesa')).toHaveValue('e2e TERRAZA');
    await expectNoOverflow(page);
  });
});
