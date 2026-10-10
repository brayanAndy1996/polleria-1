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
async function goToMenuAdmin(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: '\u00C1reas' })
    .getByRole('link', { name: 'Administraci\u00F3n' })
    .click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('link', { name: 'Carta' }).click();
  await expect(page).toHaveURL(/\/admin\/carta$/);
}
/** Devuelve el id de un producto consultando la carta real con la sesión del navegador. */
async function productIdByName(page: Page, name: string): Promise<number> {
  const response = await page.request.get('/api/products');
  expect(response.ok()).toBe(true);
  const { products } = (await response.json()) as {
    products: { id: number; name: string }[];
  };
  const found = products.find((product) => product.name === name);
  expect(found, `producto ${name} en la carta`).toBeTruthy();
  return found!.id;
}
/** Fila de la lista: el contenedor más cercano al nombre que también tiene el enlace Editar. */
function productRow(page: Page, name: string) {
  return page.locator(
    `xpath=//*[normalize-space(text())=${JSON.stringify(name)}]/ancestor::*[.//a[contains(@href,"/admin/carta/")]][1]`,
  );
}
async function expectNoOverflow(page: Page): Promise<void> {
  const sizes = await page.evaluate<{ scrollWidth: number; innerWidth: number }>(
    '({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth })',
  );
  expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.innerWidth);
}

test.describe('008: administración de la carta', () => {
  test('AC-18: alta de un plato y activar/desactivar desde la lista', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chrome', 'Solo aplica a desktop-chrome.');
    await loginAsAdmin(page);
    await goToMenuAdmin(page);
    await expect(page.getByRole('heading', { name: 'Carta', level: 1 })).toBeVisible();
    await page.getByRole('link', { name: 'Agregar producto' }).click();
    await expect(page).toHaveURL(/\/admin\/carta\/nuevo$/);
    await page.getByLabel('Nombre del producto').fill('Salchipapa E2E');
    await page.getByRole('radio', { name: 'Platos' }).check();
    await page.getByLabel('Precio').fill('12.50');
    await expect(page.getByText('S/ 12.50')).toBeVisible();
    await page.getByRole('button', { name: 'Crear producto' }).click();
    await expect(page).toHaveURL(/\/admin\/carta$/, { timeout: 10000 });
    const row = productRow(page, 'Salchipapa E2E');
    await expect(row.getByText('S/ 12.50')).toBeVisible();
    await row.getByRole('button', { name: 'Desactivar' }).click();
    await page.getByRole('button', { name: 'S\u00ED, desactivar' }).click();
    await expect(row.getByText('Desactivado')).toBeVisible();
    await row.getByRole('button', { name: 'Activar' }).click();
    await expect(row.getByText('Desactivado')).toHaveCount(0);
  });

  test('AC-19: grilla de presentaciones del pollo', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chrome', 'Solo aplica a desktop-chrome.');
    await loginAsAdmin(page);
    await goToMenuAdmin(page);
    await page.getByRole('link', { name: 'Agregar producto' }).click();
    await page.getByLabel('Nombre del producto').fill('Pollo Rístico E2E');
    await page.getByRole('radio', { name: 'Pollo' }).check();
    await page.getByLabel('Precio').fill('65');
    await page.getByRole('button', { name: 'Crear producto' }).click();
    await expect(page).toHaveURL(/\/admin\/carta\/\d+$/, { timeout: 10000 });
    const section = page.getByRole('group', { name: 'Presentaciones del pollo' });
    // Seis filas fijas siempre visibles con su checkbox y su precio.
    for (const name of [
      'Octavo — pecho',
      'Octavo — pierna',
      'Cuarto — pecho',
      'Cuarto — pierna',
      'Medio pollo',
      'Pollo entero',
    ]) {
      await expect(section.getByRole('checkbox', { name })).toBeVisible();
      await expect(section.getByLabel(`Precio de ${name}`)).toBeVisible();
    }
    // Las filas sin precio no se venden: solo se envían las marcadas con precio.
    await section.getByRole('checkbox', { name: 'Cuarto — pecho' }).check();
    await section.getByLabel('Precio de Cuarto — pecho').fill('18');
    await section.getByRole('checkbox', { name: 'Cuarto — pierna' }).check();
    await section.getByLabel('Precio de Cuarto — pierna').fill('17');
    await section.getByRole('checkbox', { name: 'Pollo entero' }).check();
    await section.getByLabel('Precio de Pollo entero').fill('65');
    await section.getByRole('button', { name: 'Guardar presentaciones' }).click();
    await expect(page.getByText('Presentaciones guardadas.')).toBeVisible();
    // La precarga tras recargar confirma el guardado real.
    await page.reload();
    const reloaded = page.getByRole('group', { name: 'Presentaciones del pollo' });
    await expect(reloaded.getByRole('checkbox', { name: 'Cuarto — pecho' })).toBeChecked();
    await expect(reloaded.getByLabel('Precio de Cuarto — pecho')).toHaveValue('18.00');
    await expect(reloaded.getByLabel('Precio de Cuarto — pierna')).toHaveValue('17.00');
    await expect(reloaded.getByRole('checkbox', { name: 'Octavo — pecho' })).not.toBeChecked();
  });

  test('AC-20: armar un combo con la comparación de precios', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chrome', 'Solo aplica a desktop-chrome.');
    await loginAsAdmin(page);
    await goToMenuAdmin(page);
    await page.getByRole('link', { name: 'Agregar producto' }).click();
    await page.getByLabel('Nombre del producto').fill('Combo Familiar E2E');
    await page.getByRole('radio', { name: 'Combos' }).check();
    await page.getByLabel('Precio').fill('30');
    await page.getByRole('button', { name: 'Crear producto' }).click();
    await expect(page).toHaveURL(/\/admin\/carta\/\d+$/, { timeout: 10000 });
    await expect(
      page.getByRole('heading', { name: 'Componentes del combo', level: 2 }),
    ).toBeVisible();
    // Tres componentes: un pollo en presentación, un plato y una bebida.
    await page.getByRole('button', { name: 'Agregar componente' }).click();
    await page.getByRole('button', { name: 'Agregar componente' }).click();
    await page.getByRole('button', { name: 'Agregar componente' }).click();
    const row1 = page.getByRole('group', { name: 'Componente 1' });
    await row1.getByRole('combobox', { name: 'Producto' }).selectOption({ label: 'E2E Pollo' });
    // Con un pollo la fila preselecciona cuarto/pierna; aquí se elige pecho.
    await expect(row1.getByRole('combobox', { name: 'Presentaci\u00F3n' })).toHaveValue('quarter');
    await row1.getByRole('combobox', { name: 'Parte' }).selectOption({ label: 'Pecho' });
    await row1.getByLabel('Cantidad').fill('1');
    const row2 = page.getByRole('group', { name: 'Componente 2' });
    await row2.getByRole('combobox', { name: 'Producto' }).selectOption({ label: 'E2E Chaufa' });
    await row2.getByLabel('Cantidad').fill('1');
    const row3 = page.getByRole('group', { name: 'Componente 3' });
    await row3.getByRole('combobox', { name: 'Producto' }).selectOption({ label: 'E2E Gaseosa' });
    await row3.getByLabel('Cantidad').fill('1');
    // 1800 (cuarto pecho) + 1400 + 400 = 3600.
    await expect(page.getByText('Los componentes por separado suman S/ 36.00.')).toBeVisible();
    await expect(
      page.getByText('El combo cuesta S/ 30.00 (S/ 6.00 menos que por separado).'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Guardar componentes' }).click();
    await expect(page.getByText('Componentes guardados.')).toBeVisible();
    // La precarga tras recargar confirma el guardado real.
    await page.reload();
    const saved1 = page.getByRole('group', { name: 'Componente 1' });
    await expect(saved1.getByRole('combobox', { name: 'Producto' })).toHaveValue(
      String(await productIdByName(page, 'E2E Pollo')),
    );
    await expect(saved1.getByRole('combobox', { name: 'Presentaci\u00F3n' })).toHaveValue(
      'quarter',
    );
    await expect(saved1.getByRole('combobox', { name: 'Parte' })).toHaveValue('breast');
    await expect(saved1.getByLabel('Cantidad')).toHaveValue('1');
    const saved3 = page.getByRole('group', { name: 'Componente 3' });
    await expect(saved3.getByRole('combobox', { name: 'Producto' })).toHaveValue(
      String(await productIdByName(page, 'E2E Gaseosa')),
    );
  });

  test('AC-21: la administración de la carta se usa a 360 px sin desplazamiento lateral', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chrome', 'Solo aplica a mobile-chrome.');
    await loginAsAdmin(page);
    await goToMenuAdmin(page);
    await expectNoOverflow(page);
    await page.getByRole('link', { name: 'Agregar producto' }).click();
    await expect(page).toHaveURL(/\/admin\/carta\/nuevo$/);
    await expectNoOverflow(page);
    // El formulario se puede usar completo a 360 px: se crea un extra.
    await page.getByLabel('Nombre del producto').fill('Extra E2E');
    await page.getByRole('radio', { name: 'Extras' }).check();
    await page.getByLabel('Precio').fill('2.50');
    await page.getByRole('button', { name: 'Crear producto' }).click();
    await expect(page).toHaveURL(/\/admin\/carta$/, { timeout: 10000 });
    await expectNoOverflow(page);
    const chaufaId = await productIdByName(page, 'E2E Chaufa');
    await productRow(page, 'E2E Chaufa').getByRole('link', { name: 'Editar' }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/carta/${chaufaId}$`));
    await expect(page.getByRole('heading', { name: 'Editar producto', level: 1 })).toBeVisible();
    await expectNoOverflow(page);
    // Edición usable a 360 px: guardar sin cambios confirma que el formulario opera.
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Cambios guardados.')).toBeVisible();
  });
});
