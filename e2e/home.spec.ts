import { expect, test } from '@playwright/test';
// '@polleria/shared' no se resuelve desde la raíz del monorepo (la raíz no lo declara como
// dependencia), así que se importa por ruta relativa.
import { healthResponseSchema } from '../packages/shared/src/index.ts';

const WEB_HOST = 'localhost:3100';
const CONNECTED_TIMEOUT_MS = 10_000;

test.describe('Pantalla de inicio', () => {
  test('AC-29: título, idioma, encabezado e indicador "Conectado" antes de 10 s', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page).toHaveTitle('Sistema Pollería');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es-PE');
    await expect(page.getByRole('heading', { level: 1, name: 'Sistema Pollería' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Conectado', {
      timeout: CONNECTED_TIMEOUT_MS,
    });
  });

  test('AC-30: todas las solicitudes HTTP y WebSocket van a localhost:3100 (sin recursos de internet)', async ({
    page,
  }) => {
    const urls: string[] = [];
    // Los oyentes se registran antes de navegar para no perder ninguna solicitud.
    page.on('request', (request) => {
      urls.push(request.url());
    });
    page.on('websocket', (webSocket) => {
      urls.push(webSocket.url());
    });

    await page.goto('/');
    await expect(page.getByRole('status')).toHaveText('Conectado', {
      timeout: CONNECTED_TIMEOUT_MS,
    });

    const checked = urls.filter((url) => !url.startsWith('data:') && !url.startsWith('blob:'));
    const outsiders = checked.filter((url) => new URL(url).host !== WEB_HOST);

    // Debe haber al menos la página y la consulta de salud, para que la prueba no pase vacía.
    expect(checked.length).toBeGreaterThanOrEqual(2);
    expect(outsiders).toEqual([]);
  });

  test('AC-31: sin desplazamiento horizontal en el celular (360 px)', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chrome', 'Solo aplica al proyecto mobile-chrome.');

    await page.goto('/');
    await expect(page.getByRole('status')).toHaveText('Conectado', {
      timeout: CONNECTED_TIMEOUT_MS,
    });

    // Se evalúa como texto: el tsconfig de la raíz no incluye los tipos del DOM.
    const sizes = await page.evaluate<{ scrollWidth: number; innerWidth: number }>(
      '({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth })',
    );

    expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.innerWidth);
  });
});

test.describe('La API se alcanza por el mismo origen de la web', () => {
  test('AC-32: GET http://localhost:3100/api/health responde 200, sin caché y con un cuerpo válido', async ({
    request,
  }) => {
    const response = await request.get(`http://${WEB_HOST}/api/health`);

    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toBe('no-store');

    const body: unknown = await response.json();
    const parsed = healthResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(body).toMatchObject({ status: 'ok', database: 'ok' });
  });
});
