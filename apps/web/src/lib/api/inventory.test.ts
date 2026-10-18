import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../tests/msw-server.ts';
import {
  addChickenBatch,
  addDrinkReceipt,
  adjustInventory,
  getInventory,
  getInventoryAvailability,
  listInventoryMovements,
  setChickenControl,
  setDrinkControl,
} from './inventory.ts';

const SNAPSHOT = {
  chicken: { enabled: true, breastEighths: 8, legEighths: 12 },
  drinks: [{ productId: 8, productName: 'Inca Kola', enabled: true, quantity: 5 }],
  generatedAt: '2026-10-17T15:00:00.000Z',
};
const MUTATION = { inventory: SNAPSHOT, movements: [] };

describe('015: cliente de inventario', () => {
  afterEach(() => vi.clearAllMocks());

  it('AC-11/13: lee snapshots directos y pagina movimientos con afterId canónico', async () => {
    const urls: string[] = [];
    server.use(
      http.get('*/api/inventory', ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json(SNAPSHOT);
      }),
      http.get('*/api/inventory/availability', ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json(SNAPSHOT);
      }),
      http.get('*/api/inventory/movements', ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json({ movements: [], nextAfterId: null });
      }),
    );
    await expect(getInventory()).resolves.toEqual(SNAPSHOT);
    await expect(getInventoryAvailability()).resolves.toEqual(SNAPSHOT);
    await expect(listInventoryMovements()).resolves.toEqual({ movements: [], nextAfterId: null });
    await expect(listInventoryMovements(51)).resolves.toEqual({
      movements: [],
      nextAfterId: null,
    });
    expect(urls).toEqual([
      `${window.location.origin}/api/inventory`,
      `${window.location.origin}/api/inventory/availability`,
      `${window.location.origin}/api/inventory/movements`,
      `${window.location.origin}/api/inventory/movements?afterId=51`,
    ]);
  });

  it('AC-11: rechaza envelopes adicionales y conserva el status de respuesta inválida', async () => {
    server.use(
      http.get('*/api/inventory', () => HttpResponse.json({ inventory: SNAPSHOT })),
      http.get('*/api/inventory/availability', () => HttpResponse.json(SNAPSHOT)),
    );
    await expect(getInventory()).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      status: 200,
    });
    await expect(getInventoryAvailability()).resolves.toEqual(SNAPSHOT);
  });

  it('AC-02/03/12: mutaciones conservan método, cuerpo, clave y status esperado', async () => {
    const seen: Array<{ method: string; url: string; key: string | null; body: unknown }> = [];
    server.use(
      http.all('*/api/inventory/*', async ({ request }) => {
        seen.push({
          method: request.method,
          url: request.url,
          key: request.headers.get('Idempotency-Key'),
          body: request.method === 'GET' ? null : await request.json(),
        });
        return HttpResponse.json(MUTATION, {
          status:
            request.url.endsWith('/batches') ||
            request.url.includes('/receipts') ||
            request.url.endsWith('/adjustments')
              ? 201
              : 200,
        });
      }),
    );
    const control = { enabled: true, reason: 'Apertura' };
    await setChickenControl(control, 'chicken-control-key');
    await setDrinkControl(8, control, 'drink-control-key');
    await addChickenBatch({ chickens: 2, reason: 'Tanda' }, 'chicken-batch-key');
    await addDrinkReceipt(8, { quantity: 3, reason: 'Compra' }, 'drink-receipt-key');
    const adjustment = { kind: 'drink' as const, productId: 8, delta: -1, reason: 'Merma' };
    await adjustInventory(adjustment, 'adjustment-key');
    expect(seen).toEqual([
      {
        method: 'PUT',
        url: `${window.location.origin}/api/inventory/chicken/control`,
        key: 'chicken-control-key',
        body: control,
      },
      {
        method: 'PUT',
        url: `${window.location.origin}/api/inventory/drinks/8/control`,
        key: 'drink-control-key',
        body: control,
      },
      {
        method: 'POST',
        url: `${window.location.origin}/api/inventory/chicken/batches`,
        key: 'chicken-batch-key',
        body: { chickens: 2, reason: 'Tanda' },
      },
      {
        method: 'POST',
        url: `${window.location.origin}/api/inventory/drinks/8/receipts`,
        key: 'drink-receipt-key',
        body: { quantity: 3, reason: 'Compra' },
      },
      {
        method: 'POST',
        url: `${window.location.origin}/api/inventory/adjustments`,
        key: 'adjustment-key',
        body: adjustment,
      },
    ]);
  });

  it('AC-07: cuerpo 201 inválido conserva el estado incierto', async () => {
    server.use(
      http.post('*/api/inventory/chicken/batches', () =>
        HttpResponse.json({ inventory: SNAPSHOT, movements: [{ id: 0 }] }, { status: 201 }),
      ),
    );
    await expect(
      addChickenBatch({ chickens: 1, reason: 'Tanda' }, 'malformed-201-key'),
    ).rejects.toMatchObject({ name: 'ApiError', code: 'UNEXPECTED_RESPONSE', status: 201 });
  });

  it('AC-11: rechaza un conflicto de negocio sin perder su code ni status', async () => {
    server.use(
      http.post('*/api/inventory/adjustments', () =>
        HttpResponse.json(
          { error: { code: 'INVENTORY_DISABLED', message: 'Activa el control.', details: null } },
          { status: 409 },
        ),
      ),
    );
    await expect(
      adjustInventory(
        { kind: 'breast', productId: null, delta: 1, reason: 'Ajuste' },
        'disabled-adjustment-key',
      ),
    ).rejects.toMatchObject({ name: 'ApiError', code: 'INVENTORY_DISABLED', status: 409 });
  });
});
