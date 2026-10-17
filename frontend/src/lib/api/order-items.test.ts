// AC-03. Spec 011 — archivo nuevo: va EN ROJO hasta que T-09 cree
// frontend/src/lib/api/order-items.ts con sendOrderItems, requestVoidItem,
// voidOrderItem y rejectVoidItem. Las cuatro emiten la cabecera Idempotency-Key
// exacta (regla de dominio 5): MSW la captura tal cual llega.
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../tests/msw-server.ts';
import { rejectVoidItem, requestVoidItem, sendOrderItems, voidOrderItem } from './order-items.ts';

const OPENED_BY = { id: 7, displayName: 'Juan' };
const ORDER = {
  id: 41,
  status: 'open',
  tables: [{ id: 3, name: 'Mesa 3' }],
  openedBy: OPENED_BY,
  openedAt: '2026-10-11T15:00:00.000Z',
  readyAt: null,
  billRequestedAt: null,
  closedAt: null,
  closedBy: null,
  cancelReason: null,
  mergedIntoOrderId: null,
  items: [],
  totalCents: 0,
};
const TICKET = {
  id: 5,
  orderId: 41,
  kind: 'initial',
  items: [],
  createdBy: OPENED_BY,
  createdAt: '2026-10-11T15:05:00.000Z',
};
const KEY = 'envio-41-9f8c2b7a-0123-4567-89ab-cdef01234567';
const errorBody = (code: string, message = 'Mensaje.', details: unknown = null) => ({
  error: { code, message, details },
});

describe('011: envío de ítems y ciclo de anulación con Idempotency-Key', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('AC-03: sendOrderItems hace POST /orders/<id>/items con la clave exacta y exige 201', async () => {
    const seen = vi.fn();
    const seenKeys: (string | null)[] = [];
    server.use(
      http.post('*/api/orders/41/items', async ({ request }) => {
        expect(request.method).toBe('POST');
        expect(request.url).toBe(`${window.location.origin}/api/orders/41/items`);
        seen(await request.json());
        seenKeys.push(request.headers.get('Idempotency-Key'));
        return HttpResponse.json({ order: ORDER, ticket: TICKET }, { status: 201 });
      }),
    );
    const body = { items: [{ productId: 1, quantity: 2, portion: 'quarter', cut: 'leg' }] };
    await expect(sendOrderItems(41, KEY, body)).resolves.toEqual({
      order: ORDER,
      ticket: TICKET,
    });
    expect(seen).toHaveBeenCalledExactlyOnceWith(body);
    expect(seenKeys).toEqual([KEY]);
    // Otro 2xx distinto del esperado se rechaza aunque el cuerpo sea válido.
    server.use(
      http.post('*/api/orders/41/items', () => HttpResponse.json({ order: ORDER, ticket: TICKET })),
    );
    await expect(sendOrderItems(41, KEY, body)).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      status: 200,
    });
    // Un 201 con cuerpo que no cuadra con sendOrderItemsResponseSchema también.
    server.use(
      http.post('*/api/orders/41/items', () =>
        HttpResponse.json({ order: ORDER }, { status: 201 }),
      ),
    );
    await expect(sendOrderItems(41, KEY, body)).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      status: 201,
    });
  });

  it('AC-03: requestVoidItem hace POST request-void con { reason } y la clave, 200 con { order }', async () => {
    const seen = vi.fn();
    const seenKeys: (string | null)[] = [];
    server.use(
      http.post('*/api/orders/41/items/11/request-void', async ({ request }) => {
        expect(request.method).toBe('POST');
        seen(await request.json());
        seenKeys.push(request.headers.get('Idempotency-Key'));
        return HttpResponse.json({ order: ORDER });
      }),
    );
    await expect(requestVoidItem(41, 11, KEY, 'El cliente se equivocó')).resolves.toEqual({
      order: ORDER,
    });
    expect(seen).toHaveBeenCalledExactlyOnceWith({ reason: 'El cliente se equivocó' });
    expect(seenKeys).toEqual([KEY]);
    server.use(
      http.post('*/api/orders/41/items/11/request-void', () =>
        HttpResponse.json({ order: ORDER, ticket: TICKET }),
      ),
    );
    await expect(requestVoidItem(41, 11, KEY, 'El cliente se equivocó')).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      status: 200,
    });
  });

  it('AC-03: voidOrderItem hace POST void con { reason } y la clave, 200 con { order, ticket }', async () => {
    const seen = vi.fn();
    const seenKeys: (string | null)[] = [];
    server.use(
      http.post('*/api/orders/41/items/11/void', async ({ request }) => {
        expect(request.method).toBe('POST');
        seen(await request.json());
        seenKeys.push(request.headers.get('Idempotency-Key'));
        return HttpResponse.json({ order: ORDER, ticket: TICKET });
      }),
    );
    await expect(voidOrderItem(41, 11, KEY, 'Error de cocina')).resolves.toEqual({
      order: ORDER,
      ticket: TICKET,
    });
    expect(seen).toHaveBeenCalledExactlyOnceWith({ reason: 'Error de cocina' });
    expect(seenKeys).toEqual([KEY]);
  });

  it('AC-03: rejectVoidItem hace POST reject-void sin cuerpo con la clave, 200 con { order }', async () => {
    const bodies: string[] = [];
    const seenKeys: (string | null)[] = [];
    server.use(
      http.post('*/api/orders/41/items/11/reject-void', async ({ request }) => {
        expect(request.method).toBe('POST');
        bodies.push(await request.text());
        seenKeys.push(request.headers.get('Idempotency-Key'));
        return HttpResponse.json({ order: ORDER });
      }),
    );
    await expect(rejectVoidItem(41, 11, KEY)).resolves.toEqual({ order: ORDER });
    expect(bodies).toEqual(['']);
    expect(seenKeys).toEqual([KEY]);
    server.use(http.post('*/api/orders/41/items/11/reject-void', () => HttpResponse.json(ORDER)));
    await expect(rejectVoidItem(41, 11, KEY)).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      status: 200,
    });
  });

  it.each<[string, () => Promise<unknown>, string, number, string, string, unknown]>([
    [
      'sendOrderItems',
      () => sendOrderItems(41, KEY, { items: [{ productId: 1 }] }),
      '*/api/orders/41/items',
      409,
      'ORDER_NOT_OPEN',
      'El pedido ya no está abierto.',
      null,
    ],
    [
      'sendOrderItems',
      () => sendOrderItems(41, KEY, { items: [{ productId: 1 }] }),
      '*/api/orders/41/items',
      409,
      'ORDER_ITEMS_LIMIT',
      'Un envío admite hasta 20 ítems.',
      null,
    ],
    [
      'sendOrderItems',
      () => sendOrderItems(41, KEY, { items: [{ productId: 1 }] }),
      '*/api/orders/41/items',
      409,
      'IDEMPOTENCY_CONFLICT',
      'La clave de idempotencia ya se usó con otro cuerpo.',
      null,
    ],
    [
      'sendOrderItems',
      () => sendOrderItems(41, KEY, { items: [{ productId: 999 }] }),
      '*/api/orders/41/items',
      400,
      'VALIDATION_ERROR',
      'Los datos enviados no son válidos.',
      {
        issues: [
          { path: 'items.0.productId', message: 'Ese producto está desactivada en la carta.' },
          { path: 'items.0.portion', message: 'Indica la presentación del pollo.' },
        ],
      },
    ],
    [
      'requestVoidItem',
      () => requestVoidItem(41, 11, KEY, 'El cliente se equivocó'),
      '*/api/orders/41/items/11/request-void',
      404,
      'ORDER_ITEM_NOT_FOUND',
      'Ese ítem no existe.',
      null,
    ],
    [
      'requestVoidItem',
      () => requestVoidItem(41, 11, KEY, 'El cliente se equivocó'),
      '*/api/orders/41/items/11/request-void',
      409,
      'ORDER_ITEM_VOID_REQUESTED',
      'El ítem ya tiene una anulación pedida.',
      null,
    ],
    [
      'requestVoidItem',
      () => requestVoidItem(41, 11, KEY, 'El cliente se equivocó'),
      '*/api/orders/41/items/11/request-void',
      409,
      'ORDER_ITEM_ALREADY_VOIDED',
      'El ítem ya está anulado.',
      null,
    ],
    [
      'voidOrderItem',
      () => voidOrderItem(41, 11, KEY, 'Error de cocina'),
      '*/api/orders/41/items/11/void',
      409,
      'ORDER_ITEM_ALREADY_VOIDED',
      'El ítem ya está anulado.',
      null,
    ],
    [
      'rejectVoidItem',
      () => rejectVoidItem(41, 11, KEY),
      '*/api/orders/41/items/11/reject-void',
      409,
      'ORDER_ITEM_NOT_REQUESTED',
      'El ítem no tiene una anulación pedida.',
      null,
    ],
    [
      'rejectVoidItem',
      () => rejectVoidItem(41, 11, KEY),
      '*/api/orders/41/items/11/reject-void',
      403,
      'FORBIDDEN',
      'No tienes permiso para esta acción.',
      null,
    ],
  ])(
    'AC-03: %s conserva code, message y details del error %s de la API',
    async (_name, call, path, status, code, message, details) => {
      server.use(
        http.post(path, () => HttpResponse.json(errorBody(code, message, details), { status })),
      );
      await expect(call()).rejects.toMatchObject({ status, code, message, details });
    },
  );
});
