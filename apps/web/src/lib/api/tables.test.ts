// AC-01 de la spec 011 (verde) y AC-01 de la spec 012 (en rojo por ausencia: la
// T-06 suma createTable y updateTable a lib/api/tables.ts). MSW intercepta
// /api/... del mismo origen y verifica método, ruta, cuerpo y que los ApiError
// propaguen code, message y details.
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Table, UpdateTableRequest } from '@polleria/shared';
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

const TABLE_CREATED = { id: 12, name: 'Balcón 1', isActive: true, state: 'free', order: null };
const TABLE_RENAMED = { ...TABLE_BUSY, name: 'Balcón 1' };

describe('012: funciones de administración de mesas', () => {
  // AC-01 de la spec 012: createTable y updateTable todavía no existen en
  // lib/api/tables.ts (rojo por ausencia). Se resuelven con import dinámico para
  // que el describe de la 011 siga verde aunque el módulo no exporte aún los
  // nombres nuevos — las firmas que la T-06 debe cumplir son estas.
  let createTable: (name: string) => Promise<Table>;
  let updateTable: (tableId: number, changes: UpdateTableRequest) => Promise<Table>;

  beforeEach(async () => {
    ({ createTable, updateTable } = await import('./tables.ts'));
  });

  it('AC-01: createTable hace POST /tables con { name } y exige 201 con Table', async () => {
    const seen = vi.fn();
    server.use(
      http.post('*/api/tables', async ({ request }) => {
        expect(request.method).toBe('POST');
        expect(request.url).toBe(`${window.location.origin}/api/tables`);
        seen(await request.json());
        return HttpResponse.json(TABLE_CREATED, { status: 201 });
      }),
    );
    await expect(createTable('Balcón 1')).resolves.toEqual(TABLE_CREATED);
    expect(seen).toHaveBeenCalledExactlyOnceWith({ name: 'Balcón 1' });
  });

  it.each<[string, UpdateTableRequest, typeof TABLE_RENAMED | typeof TABLE_INACTIVE]>([
    ['{ name }', { name: 'Balcón 1' }, TABLE_RENAMED],
    ['{ isActive: false }', { isActive: false }, { ...TABLE_BUSY, isActive: false }],
    ['{ isActive: true }', { isActive: true }, TABLE_INACTIVE],
  ])('AC-01: updateTable hace PATCH /tables/<id> con %s y exige 200 con Table', async (
    _body,
    changes,
    response,
  ) => {
    const seen = vi.fn();
    server.use(
      http.patch('*/api/tables/3', async ({ request }) => {
        expect(request.method).toBe('PATCH');
        expect(request.url).toBe(`${window.location.origin}/api/tables/3`);
        seen(await request.json());
        return HttpResponse.json(response);
      }),
    );
    await expect(updateTable(3, changes)).resolves.toEqual(response);
    expect(seen).toHaveBeenCalledExactlyOnceWith(changes);
  });

  it('AC-01: createTable rechaza otro 2xx o un 201 sin Table conservando el status real', async () => {
    server.use(http.post('*/api/tables', () => HttpResponse.json(TABLE_CREATED)));
    await expect(createTable('Balcón 1')).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      status: 200,
    });
    server.use(
      http.post('*/api/tables', () =>
        HttpResponse.json({ ...TABLE_CREATED, name: 5 }, { status: 201 }),
      ),
    );
    await expect(createTable('Balcón 1')).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      status: 201,
    });
  });

  it('AC-01: updateTable rechaza otro 2xx o un 200 sin Table conservando el status real', async () => {
    server.use(http.patch('*/api/tables/3', () => HttpResponse.json(TABLE_BUSY, { status: 201 })));
    await expect(updateTable(3, { name: 'Balcón 1' })).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      status: 201,
    });
    server.use(http.patch('*/api/tables/3', () => HttpResponse.json({ tables: [TABLE_BUSY] })));
    await expect(updateTable(3, { name: 'Balcón 1' })).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      status: 200,
    });
  });

  it.each<
    [string, () => Promise<unknown>, typeof http.post, string, number, string, string, unknown]
  >([
    [
      'createTable',
      () => createTable('Mesa 3'),
      http.post,
      '*/api/tables',
      409,
      'TABLE_NAME_TAKEN',
      'Ya existe una mesa con ese nombre.',
      null,
    ],
    [
      'createTable',
      () => createTable('Mesa 3'),
      http.post,
      '*/api/tables',
      400,
      'VALIDATION_ERROR',
      'Los datos enviados no son válidos.',
      {
        issues: [
          {
            path: 'name',
            message: 'El nombre de la mesa no puede pasar de 40 caracteres.',
          },
        ],
      },
    ],
    [
      'updateTable',
      () => updateTable(3, { name: 'Mesa 2' }),
      http.patch,
      '*/api/tables/3',
      409,
      'TABLE_NAME_TAKEN',
      'Ya existe una mesa con ese nombre.',
      null,
    ],
    [
      'updateTable',
      () => updateTable(3, { isActive: false }),
      http.patch,
      '*/api/tables/3',
      409,
      'TABLE_HAS_OPEN_ORDER',
      'La mesa tiene un pedido abierto; ciérralo o muévelo antes de desactivarla.',
      null,
    ],
    [
      'updateTable',
      () => updateTable(99, { name: 'Balcón 1' }),
      http.patch,
      '*/api/tables/99',
      404,
      'TABLE_NOT_FOUND',
      'Esa mesa no existe.',
      null,
    ],
  ])(
    'AC-01: %s conserva code, message y details del error %s de la API',
    async (_name, call, method, path, status, code, message, details) => {
      server.use(
        method(path, () => HttpResponse.json(errorBody(code, message, details), { status })),
      );
      await expect(call()).rejects.toMatchObject({ status, code, message, details });
    },
  );
});
