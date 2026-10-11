// AC-01. Spec 011 — archivo nuevo: va EN ROJO hasta que T-09 cree
// apps/web/src/lib/api/tables.ts con getTables, openTableOrder, joinTable y
// leaveTable. MSW intercepta /api/... del mismo origen y verifica método, ruta,
// cuerpo y que los ApiError propaguen code, message y details.
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../tests/msw-server.ts';
import { getTables, joinTable, leaveTable, openTableOrder } from './tables.ts';

vi.mock('../navigation.ts', () => ({ hardNavigate: vi.fn() }));

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
const TABLE_FREE = { id: 1, name: 'Mesa 1', isActive: true, state: 'free', order: null };
const TABLE_BUSY = { id: 3, name: 'Mesa 3', isActive: true, state: 'occupied', order: ORDER };
const TABLE_INACTIVE = { id: 9, name: 'Mesa 9', isActive: false, state: 'free', order: null };
const errorBody = (code: string, message = 'Mensaje.', details: unknown = null) => ({
  error: { code, message, details },
});

describe('011: funciones de la API de mesas', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('AC-01: getTables hace GET /tables y devuelve la lista validada', async () => {
    server.use(
      http.get('*/api/tables', ({ request }) => {
        expect(request.method).toBe('GET');
        expect(request.url).toBe(`${window.location.origin}/api/tables`);
        return HttpResponse.json({ tables: [TABLE_FREE, TABLE_BUSY, TABLE_INACTIVE] });
      }),
    );
    await expect(getTables()).resolves.toEqual([TABLE_FREE, TABLE_BUSY, TABLE_INACTIVE]);
  });

  it.each([
    { tables: [{ ...TABLE_FREE, ubication: 'salón' }] },
    { lista: [] },
    { tables: 'x' },
    [],
  ])(
    'AC-01: getTables rechaza la respuesta mal formada %s conservando el status real',
    async (body) => {
      server.use(http.get('*/api/tables', () => HttpResponse.json(body)));
      await expect(getTables()).rejects.toMatchObject({
        code: 'UNEXPECTED_RESPONSE',
        status: 200,
      });
    },
  );

  it('AC-01: openTableOrder hace POST /tables/<id>/orders sin cuerpo y exige 201 con Order', async () => {
    const calls: string[] = [];
    server.use(
      http.post('*/api/tables/1/orders', async ({ request }) => {
        expect(request.method).toBe('POST');
        expect(request.url).toBe(`${window.location.origin}/api/tables/1/orders`);
        calls.push(await request.text());
        return HttpResponse.json(ORDER, { status: 201 });
      }),
    );
    await expect(openTableOrder(1)).resolves.toEqual(ORDER);
    expect(calls).toEqual(['']);
    // Otro 2xx distinto del esperado se rechaza aunque el cuerpo sea válido.
    server.use(http.post('*/api/tables/1/orders', () => HttpResponse.json(ORDER)));
    await expect(openTableOrder(1)).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE' });
    // Un 201 con un cuerpo que no es Order también se rechaza, con el status real.
    server.use(
      http.post('*/api/tables/1/orders', () =>
        HttpResponse.json({ ...ORDER, color: 'azul' }, { status: 201 }),
      ),
    );
    await expect(openTableOrder(1)).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      status: 201,
    });
  });

  it('AC-01: joinTable hace POST /tables/<id>/join con { intoTableId } y exige 200', async () => {
    const seen = vi.fn();
    const joinedOrder = {
      ...ORDER,
      tables: [
        { id: 3, name: 'Mesa 3' },
        { id: 4, name: 'Mesa 4' },
      ],
    };
    server.use(
      http.post('*/api/tables/4/join', async ({ request }) => {
        expect(request.method).toBe('POST');
        expect(request.url).toBe(`${window.location.origin}/api/tables/4/join`);
        seen(await request.json());
        return HttpResponse.json(joinedOrder);
      }),
    );
    await expect(joinTable(4, 3)).resolves.toEqual(joinedOrder);
    expect(seen).toHaveBeenCalledExactlyOnceWith({ intoTableId: 3 });
    server.use(http.post('*/api/tables/4/join', () => HttpResponse.json({ order: joinedOrder })));
    await expect(joinTable(4, 3)).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      status: 200,
    });
  });

  it('AC-01: leaveTable hace POST /tables/<id>/leave sin cuerpo y exige 200', async () => {
    const calls: string[] = [];
    server.use(
      http.post('*/api/tables/4/leave', async ({ request }) => {
        expect(request.method).toBe('POST');
        expect(request.url).toBe(`${window.location.origin}/api/tables/4/leave`);
        calls.push(await request.text());
        return HttpResponse.json(ORDER);
      }),
    );
    await expect(leaveTable(4)).resolves.toEqual(ORDER);
    expect(calls).toEqual(['']);
    server.use(http.post('*/api/tables/4/leave', () => HttpResponse.json(ORDER, { status: 201 })));
    await expect(leaveTable(4)).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      status: 201,
    });
  });

  it.each<[string, () => Promise<unknown>, string, number, string, string]>([
    [
      'openTableOrder',
      () => openTableOrder(3),
      '*/api/tables/3/orders',
      409,
      'TABLE_OCCUPIED',
      'La mesa ya tiene un pedido abierto.',
    ],
    [
      'openTableOrder',
      () => openTableOrder(9),
      '*/api/tables/9/orders',
      409,
      'TABLE_INACTIVE',
      'La mesa está desactivada.',
    ],
    [
      'joinTable',
      () => joinTable(9, 3),
      '*/api/tables/9/join',
      409,
      'TABLE_INACTIVE',
      'La mesa está desactivada.',
    ],
    [
      'joinTable',
      () => joinTable(4, 1),
      '*/api/tables/4/join',
      409,
      'TABLE_HAS_NO_ORDER',
      'La mesa no tiene un pedido abierto.',
    ],
    [
      'leaveTable',
      () => leaveTable(1),
      '*/api/tables/1/leave',
      409,
      'TABLE_HAS_NO_ORDER',
      'La mesa no tiene un pedido abierto.',
    ],
    [
      'leaveTable',
      () => leaveTable(3),
      '*/api/tables/3/leave',
      409,
      'ORDER_NEEDS_TABLE',
      'El pedido necesita al menos una mesa; cancélalo o ciérralo.',
    ],
    [
      'leaveTable',
      () => leaveTable(99),
      '*/api/tables/99/leave',
      404,
      'TABLE_NOT_FOUND',
      'Esa mesa no existe.',
    ],
  ])(
    'AC-01: %s conserva code, message y details del error %s de la API',
    async (_name, call, path, status, code, message) => {
      server.use(http.post(path, () => HttpResponse.json(errorBody(code, message), { status })));
      await expect(call()).rejects.toMatchObject({ status, code, message });
    },
  );

  it('AC-01: getTables propaga el ApiError de la API (UNAUTHENTICATED 401)', async () => {
    server.use(
      http.get('*/api/tables', () =>
        HttpResponse.json(errorBody('UNAUTHENTICATED', 'Tu sesión venció.'), { status: 401 }),
      ),
    );
    await expect(getTables()).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'Tu sesión venció.',
    });
  });
});
