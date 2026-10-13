// AC-02. Spec 011 — archivo nuevo: va EN ROJO hasta que T-09 cree
// apps/web/src/lib/api/orders.ts con getOrder, moveOrder, requestBill, markReady,
// markServed, cancelOrder y getOrderTickets. MSW intercepta /api/... del mismo
// origen y verifica método, ruta y cuerpo; los errores llegan como ApiError.
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../tests/msw-server.ts';
import {
  cancelOrder,
  getOrder,
  getOrderTickets,
  markReady,
  markServed,
  moveOrder,
  requestBill,
} from './orders.ts';

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
const errorBody = (code: string, message = 'Mensaje.', details: unknown = null) => ({
  error: { code, message, details },
});

describe('011: funciones de la API de pedidos y comandas', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('AC-02: getOrder hace GET /orders/<id> y devuelve el pedido validado', async () => {
    server.use(
      http.get('*/api/orders/41', ({ request }) => {
        expect(request.method).toBe('GET');
        expect(request.url).toBe(`${window.location.origin}/api/orders/41`);
        return HttpResponse.json(ORDER);
      }),
    );
    await expect(getOrder(41)).resolves.toEqual(ORDER);
    server.use(http.get('*/api/orders/41', () => HttpResponse.json({ order: ORDER })));
    await expect(getOrder(41)).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      status: 200,
    });
  });

  it('AC-02: moveOrder hace POST /orders/<id>/move con { tableId } y exige 200', async () => {
    const seen = vi.fn();
    server.use(
      http.post('*/api/orders/41/move', async ({ request }) => {
        expect(request.method).toBe('POST');
        seen(await request.json());
        return HttpResponse.json(ORDER);
      }),
    );
    await expect(moveOrder(41, 2)).resolves.toEqual(ORDER);
    expect(seen).toHaveBeenCalledExactlyOnceWith({ tableId: 2 });
    server.use(http.post('*/api/orders/41/move', () => HttpResponse.json(ORDER, { status: 201 })));
    await expect(moveOrder(41, 2)).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      status: 201,
    });
  });

  it.each<[string, (orderId: number) => Promise<unknown>, string]>([
    ['requestBill', requestBill, 'request-bill'],
    ['markReady', markReady, 'ready'],
    ['markServed', markServed, 'served'],
  ])(
    'AC-02: %s hace POST /orders/<id>/%s sin cuerpo y exige 200 con Order',
    async (_name, call, action) => {
      const bodies: string[] = [];
      server.use(
        http.post(`*/api/orders/41/${action}`, async ({ request }) => {
          expect(request.method).toBe('POST');
          expect(request.url).toBe(`${window.location.origin}/api/orders/41/${action}`);
          bodies.push(await request.text());
          return HttpResponse.json(ORDER);
        }),
      );
      await expect(call(41)).resolves.toEqual(ORDER);
      expect(bodies).toEqual(['']);
      server.use(
        http.post(`*/api/orders/41/${action}`, () =>
          HttpResponse.json({ ...ORDER, extra: 1 }, { status: 200 }),
        ),
      );
      await expect(call(41)).rejects.toMatchObject({
        code: 'UNEXPECTED_RESPONSE',
        status: 200,
      });
    },
  );

  it('AC-02: cancelOrder hace POST /orders/<id>/cancel con { reason } y exige 200', async () => {
    const seen = vi.fn();
    server.use(
      http.post('*/api/orders/41/cancel', async ({ request }) => {
        expect(request.method).toBe('POST');
        seen(await request.json());
        return HttpResponse.json({ ...ORDER, status: 'cancelled', cancelReason: 'Se fueron' });
      }),
    );
    await expect(cancelOrder(41, 'Se fueron')).resolves.toEqual({
      ...ORDER,
      status: 'cancelled',
      cancelReason: 'Se fueron',
    });
    expect(seen).toHaveBeenCalledExactlyOnceWith({ reason: 'Se fueron' });
  });

  it('AC-02: getOrderTickets hace GET /orders/<id>/tickets y devuelve las comandas', async () => {
    server.use(
      http.get('*/api/orders/41/tickets', ({ request }) => {
        expect(request.method).toBe('GET');
        expect(request.url).toBe(`${window.location.origin}/api/orders/41/tickets`);
        return HttpResponse.json({ tickets: [TICKET] });
      }),
    );
    await expect(getOrderTickets(41)).resolves.toEqual([TICKET]);
    server.use(http.get('*/api/orders/41/tickets', () => HttpResponse.json({ tickets: [{}] })));
    await expect(getOrderTickets(41)).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      status: 200,
    });
  });

  it.each<[string, () => Promise<unknown>, string, number, string, string, unknown]>([
    [
      'getOrder',
      () => getOrder(99),
      '*/api/orders/99',
      404,
      'ORDER_NOT_FOUND',
      'Ese pedido no existe.',
      null,
    ],
    [
      'moveOrder',
      () => moveOrder(41, 3),
      '*/api/orders/41/move',
      409,
      'TABLE_OCCUPIED',
      'La mesa ya tiene un pedido abierto.',
      null,
    ],
    [
      'moveOrder',
      () => moveOrder(41, 9),
      '*/api/orders/41/move',
      409,
      'TABLE_INACTIVE',
      'La mesa está desactivada.',
      null,
    ],
    [
      'requestBill',
      () => requestBill(41),
      '*/api/orders/41/request-bill',
      409,
      'ORDER_NOT_OPEN',
      'El pedido ya no está abierto.',
      null,
    ],
    [
      'markReady',
      () => markReady(41),
      '*/api/orders/41/ready',
      409,
      'ORDER_NOT_OPEN',
      'El pedido ya no está abierto.',
      null,
    ],
    [
      'markServed',
      () => markServed(41),
      '*/api/orders/41/served',
      409,
      'ORDER_NOT_OPEN',
      'El pedido ya no está abierto.',
      null,
    ],
    [
      'cancelOrder',
      () => cancelOrder(41, 'Se fueron'),
      '*/api/orders/41/cancel',
      409,
      'ORDER_HAS_ACTIVE_ITEMS',
      'El pedido tiene ítems sin anular; un administrador debe anularlos primero.',
      null,
    ],
    [
      'cancelOrder',
      () => cancelOrder(41, ''),
      '*/api/orders/41/cancel',
      400,
      'VALIDATION_ERROR',
      'Los datos enviados no son válidos.',
      {
        issues: [
          { path: 'reason', message: 'Escribe el motivo de la anulación (hasta 200 caracteres).' },
        ],
      },
    ],
  ])(
    'AC-02: %s conserva code, message y details del error %s de la API',
    async (_name, call, path, status, code, message, details) => {
      const handler =
        path === '*/api/orders/99'
          ? http.get(path, () => HttpResponse.json(errorBody(code, message, details), { status }))
          : http.post(path, () => HttpResponse.json(errorBody(code, message, details), { status }));
      server.use(handler);
      await expect(call()).rejects.toMatchObject({ status, code, message, details });
    },
  );
});
