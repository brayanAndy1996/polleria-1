import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../msw-server.ts';
import MesasPage from '../../src/app/admin/mesas/page.tsx';
import { hardNavigate } from '../../src/lib/navigation.ts';

/**
 * Auditoría adversarial de la spec 012 (pantalla /admin/mesas, ya en verde con
 * los tests de AC). Los bloques ADV-012-01 a ADV-012-03 demuestran defectos en
 * ROJO — no se "arreglan" debilitando la prueba, el orquestador asigna la
 * corrección. Los bloques ADV-012-04 en adelante son vectores que resistieron y
 * quedan como regresión en verde.
 *
 * Hallazgos en rojo:
 * - ADV-012-01 (medio): un fallo de la RELEÍDA tras una mutación propia tumba la
 *   lista ya cargada. La consulta tiene datos pero una refetch que falla deja
 *   status 'error' y la pantalla evalúa `isError` antes que la data: la lista
 *   entera, el alta en línea (con su borrador) y el diálogo de renombrado se
 *   desmontan por una intermitencia del wifi — el mismo hueco que ADV-011-03.
 * - ADV-012-02 (medio): el overlay `applied` nunca se reconcilia con la releída.
 *   Cada mesa confirmada por la API queda pegada por siempre: si otro
 *   dispositivo cambia nombre o estado, la versión local vieja tapa la verdad
 *   del servidor en todas las releídas siguientes (contra §15: "el último PATCH
 *   confirmado gana" y contra la propia doc que lo presenta como puente
 *   transitorio). El estado derivado queda igual de congelado.
 * - ADV-012-03 (bajo): el mensaje del servidor persiste mientras el admin
 *   corrige el campo — tras un 409 el 'Ya existe una mesa con ese nombre.'
 *   sigue visible aunque el texto ya sea otro, en el alta y en el renombrado
 *   (misma clase que ADV-011-07).
 *
 * Vectores que resistieron (regresión en verde): ADV-012-04 un solo envío en
 * vuelo por acción (doble toque en el mismo tick en alta, Guardar, Sí-desactivar
 * y Activar), ADV-012-05 el guard se libera tras el fallo y el borrador se
 * conserva para el reintento, ADV-012-06 nombres hostiles (espacios, NFC/NFD,
 * 40 exactos, controles bidi, tab, <script>, emoji; las letras árabes sí pasan
 * — decisión del esquema de shared), ADV-012-07 un 401 en la mutación lleva a
 * /login, ADV-012-08 respuestas fuera de esquema o errores malformados muestran
 * un mensaje razonable sin tumbar la pantalla, ADV-012-09 dos 'Desactivar' en
 * filas distintas viajan en paralelo y ambas quedan desactivadas, ADV-012-10 el
 * nombre accesible 'Guardar' se mantiene durante 'Guardando...' y el diálogo
 * sobrevive a la releída con su borrador, ADV-012-11 la mesa ocupada conserva
 * 'Renombrar' (200) y 'Desactivar' (409), ADV-012-12 el alta nueva no se
 * duplica cuando llega la releída y aparece aunque la releída aún no la traiga,
 * y ADV-012-13 'Guardar' sigue inhabilitado cuando el nombre normalizado no
 * cambia (NFD vs NFC).
 */
const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  usePathname: () => window.location.pathname,
}));
vi.mock('../../src/lib/navigation.ts', () => ({ hardNavigate: vi.fn() }));

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const SESSION_ADMIN = {
  user: { id: 1, username: 'dueno', displayName: 'Carlos', roles: ['admin'] },
  expiresAt: '2026-10-20T07:00:00.000Z',
};
const SESSION_WAITER = {
  user: { id: 7, username: 'mozo.juan', displayName: 'Juan', roles: ['waiter'] },
  expiresAt: '2026-10-20T07:00:00.000Z',
};
const ORDER = {
  id: 41,
  status: 'open',
  tables: [{ id: 2, name: 'Mesa 3' }],
  openedBy: { id: 7, displayName: 'Juan' },
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
const MESA2 = { id: 1, name: 'Mesa 2', isActive: true, state: 'free', order: null };
const MESA3 = { id: 2, name: 'Mesa 3', isActive: true, state: 'occupied', order: ORDER };
const MESA4 = { id: 4, name: 'Mesa 4', isActive: true, state: 'free', order: null };
const MESA10 = { id: 5, name: 'Mesa 10', isActive: false, state: 'free', order: null };
const TABLES = [MESA2, MESA3, MESA4, MESA10];
const errorBody = (code: string, message = 'Mensaje.', details: JsonValue = null) => ({
  error: { code, message, details },
});
const NETWORK = 'Sin conexión con el servidor. Revisa el wifi e intenta de nuevo.';
const UNEXPECTED = 'Respuesta inesperada del servidor. Intenta nuevamente.';

function show(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return {
    client,
    ...render(<QueryClientProvider client={client}>{node}</QueryClientProvider>),
  };
}
function mockSession(session: JsonValue = SESSION_ADMIN) {
  server.use(http.get('*/api/auth/me', () => HttpResponse.json(session as object)));
}
function mockTables(tables: JsonValue[] = TABLES) {
  server.use(http.get('*/api/tables', () => HttpResponse.json({ tables })));
}
/** Fila de la mesa: el ancestro más cercano del nombre que contiene 'Renombrar'. */
function tableRow(name: string): HTMLElement {
  let element: HTMLElement | null = screen.getByText(name);
  while (element !== null) {
    if (within(element).queryByRole('button', { name: 'Renombrar' }) !== null) break;
    element = element.parentElement;
  }
  expect(element, `fila de ${name}`).not.toBeNull();
  return element as HTMLElement;
}
/** Contenedor del panel de renombrado: el ancestro del título que tiene 'Guardar'. */
function renamePanel(): HTMLElement {
  let element: HTMLElement | null = screen.getByText('Renombrar mesa');
  while (element !== null) {
    if (within(element).queryByRole('button', { name: 'Guardar' }) !== null) break;
    element = element.parentElement;
  }
  expect(element, 'panel Renombrar mesa').not.toBeNull();
  return element as HTMLElement;
}
/** Puerta que retiene una respuesta hasta `release()`. */
function gate() {
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { waiting, release };
}

describe('ADV-012-01: un fallo de la releída tras mutar no borra la lista cargada', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/admin/mesas');
    mockSession();
  });

  it('la releída que falla tras desactivar conserva la lista y el borrador del alta', async () => {
    let failGets = false;
    const tables = structuredClone(TABLES);
    server.use(
      http.get('*/api/tables', () =>
        failGets ? HttpResponse.error() : HttpResponse.json({ tables }),
      ),
      http.patch('*/api/tables/1', async ({ request }) => {
        const body = (await request.json()) as Record<string, JsonValue>;
        return HttpResponse.json({ ...MESA2, ...body });
      }),
    );
    show(<MesasPage />);
    await screen.findByText('Mesa 3');
    // El admin tiene un borrador a medio escribir cuando hace otra acción.
    fireEvent.change(screen.getByLabelText('Nombre de la mesa'), {
      target: { value: 'Balcón' },
    });
    // La desactivación sale bien (200) pero la releída posterior falla por red.
    failGets = true;
    fireEvent.click(within(tableRow('Mesa 2')).getByRole('button', { name: 'Desactivar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, desactivar' }));
    await screen.findByRole('alert');
    // Lo correcto: la lista conserva los datos que ya tenía (quizá con un aviso),
    // no una pantalla de error que además desmonta el formulario y pierde el borrador.
    expect(screen.getByText('Mesa 3')).toBeVisible();
    expect(screen.getByLabelText('Nombre de la mesa')).toHaveValue('Balcón');
  });
});

describe('ADV-012-02: el overlay `applied` se reconcilia con la releída', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/admin/mesas');
    mockSession();
  });

  it('un renombrado hecho en OTRO dispositivo aparece en la siguiente releída', async () => {
    let tables = structuredClone(TABLES);
    server.use(
      http.get('*/api/tables', () => HttpResponse.json({ tables })),
      http.patch('*/api/tables/1', async ({ request }) => {
        const body = (await request.json()) as Record<string, JsonValue>;
        tables = tables.map((table) => (table.id === 1 ? { ...table, ...body } : table));
        return HttpResponse.json(tables.find((table) => table.id === 1));
      }),
      http.patch('*/api/tables/2', async ({ request }) => {
        const body = (await request.json()) as Record<string, JsonValue>;
        tables = tables.map((table) => (table.id === 2 ? { ...table, ...body } : table));
        return HttpResponse.json(tables.find((table) => table.id === 2));
      }),
    );
    show(<MesasPage />);
    await screen.findByText('Mesa 3');
    // Este admin renombra Mesa 2 a 'Barra'.
    fireEvent.click(within(tableRow('Mesa 2')).getByRole('button', { name: 'Renombrar' }));
    fireEvent.change(within(renamePanel()).getByLabelText('Nombre de la mesa'), {
      target: { value: 'Barra' },
    });
    fireEvent.click(within(renamePanel()).getByRole('button', { name: 'Guardar' }));
    await screen.findByText('Barra');
    // Otro dispositivo la renombra a 'Terraza': la verdad del servidor cambia.
    tables = tables.map((table) => (table.id === 1 ? { ...table, name: 'Terraza' } : table));
    // Una mutación propia (desactivar Mesa 3) fuerza la releída de la lista.
    fireEvent.click(within(tableRow('Mesa 3')).getByRole('button', { name: 'Desactivar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, desactivar' }));
    await within(tableRow('Mesa 3')).findByText('Desactivada');
    // La releída YA trajo 'Terraza': la fila debe reflejarla, no el borrador viejo.
    expect(screen.getByText('Terraza')).toBeVisible();
  });

  it('el estado derivado de una mesa ya tocada se actualiza con la releída', async () => {
    let tables = structuredClone(TABLES);
    server.use(
      http.get('*/api/tables', () => HttpResponse.json({ tables })),
      http.patch('*/api/tables/1', async ({ request }) => {
        const body = (await request.json()) as Record<string, JsonValue>;
        tables = tables.map((table) => (table.id === 1 ? { ...table, ...body } : table));
        return HttpResponse.json(tables.find((table) => table.id === 1));
      }),
      http.patch('*/api/tables/2', async ({ request }) => {
        const body = (await request.json()) as Record<string, JsonValue>;
        tables = tables.map((table) => (table.id === 2 ? { ...table, ...body } : table));
        return HttpResponse.json(tables.find((table) => table.id === 2));
      }),
    );
    show(<MesasPage />);
    await screen.findByText('Mesa 3');
    // Renombrar Mesa 2 (libre): el overlay guarda una copia con state 'free'.
    fireEvent.click(within(tableRow('Mesa 2')).getByRole('button', { name: 'Renombrar' }));
    fireEvent.change(within(renamePanel()).getByLabelText('Nombre de la mesa'), {
      target: { value: 'Barra' },
    });
    fireEvent.click(within(renamePanel()).getByRole('button', { name: 'Guardar' }));
    await screen.findByText('Barra');
    // Un mozo abre un pedido en esa mesa: la releída la trae 'occupied'.
    tables = tables.map((table) =>
      table.id === 1 ? { ...table, state: 'occupied', order: ORDER } : table,
    );
    fireEvent.click(within(tableRow('Mesa 3')).getByRole('button', { name: 'Desactivar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, desactivar' }));
    await within(tableRow('Mesa 3')).findByText('Desactivada');
    // La fila debe mostrar el estado real del salón, no el 'Libre' congelado.
    expect(within(tableRow('Barra')).getByText('Ocupada')).toBeVisible();
  });
});

describe('ADV-012-03: el mensaje del servidor se limpia al corregir el campo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/admin/mesas');
    mockSession();
    mockTables();
  });

  it('en el alta, editar el nombre retira el TABLE_NAME_TAKEN anterior', async () => {
    server.use(
      http.post('*/api/tables', () =>
        HttpResponse.json(errorBody('TABLE_NAME_TAKEN', 'Ya existe una mesa con ese nombre.'), {
          status: 409,
        }),
      ),
    );
    show(<MesasPage />);
    await screen.findByText('Mesa 3');
    fireEvent.change(screen.getByLabelText('Nombre de la mesa'), {
      target: { value: 'Mesa 3' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar mesa' }));
    expect(await screen.findByText('Ya existe una mesa con ese nombre.')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Nombre de la mesa'), {
      target: { value: 'Mesa 99' },
    });
    expect(screen.queryByText('Ya existe una mesa con ese nombre.')).toBeNull();
  });

  it('en el renombrado, editar el nombre retira el TABLE_NAME_TAKEN anterior', async () => {
    server.use(
      http.patch('*/api/tables/1', () =>
        HttpResponse.json(errorBody('TABLE_NAME_TAKEN', 'Ya existe una mesa con ese nombre.'), {
          status: 409,
        }),
      ),
    );
    show(<MesasPage />);
    await screen.findByText('Mesa 3');
    fireEvent.click(within(tableRow('Mesa 2')).getByRole('button', { name: 'Renombrar' }));
    const field = within(renamePanel()).getByLabelText('Nombre de la mesa');
    fireEvent.change(field, { target: { value: 'Mesa 3' } });
    fireEvent.click(within(renamePanel()).getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Ya existe una mesa con ese nombre.')).toBeVisible();
    fireEvent.change(field, { target: { value: 'Mesa 99' } });
    expect(screen.queryByText('Ya existe una mesa con ese nombre.')).toBeNull();
  });
});

describe('ADV-012-04: un solo envío en vuelo por acción', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/admin/mesas');
    mockSession();
    mockTables();
  });

  it('el doble toque en "Agregar mesa" produce un solo POST', async () => {
    const { waiting, release } = gate();
    const calls: JsonValue[] = [];
    const created = { id: 9, name: 'Balcón 1', isActive: true, state: 'free', order: null };
    server.use(
      http.post('*/api/tables', async ({ request }) => {
        calls.push((await request.json()) as JsonValue);
        await waiting;
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    show(<MesasPage />);
    await screen.findByText('Mesa 3');
    fireEvent.change(screen.getByLabelText('Nombre de la mesa'), {
      target: { value: 'Balcón 1' },
    });
    const button = screen.getByRole('button', { name: 'Agregar mesa' });
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    release();
    await waitFor(() => expect(calls).toEqual([{ name: 'Balcón 1' }]));
  });

  it('el doble toque en "Guardar" produce un solo PATCH', async () => {
    const { waiting, release } = gate();
    const calls: JsonValue[] = [];
    server.use(
      http.patch('*/api/tables/1', async ({ request }) => {
        calls.push((await request.json()) as JsonValue);
        await waiting;
        return HttpResponse.json({ ...MESA2, name: 'Barra' });
      }),
    );
    show(<MesasPage />);
    await screen.findByText('Mesa 3');
    fireEvent.click(within(tableRow('Mesa 2')).getByRole('button', { name: 'Renombrar' }));
    fireEvent.change(within(renamePanel()).getByLabelText('Nombre de la mesa'), {
      target: { value: 'Barra' },
    });
    const button = within(renamePanel()).getByRole('button', { name: 'Guardar' });
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    release();
    await waitFor(() => expect(calls).toEqual([{ name: 'Barra' }]));
  });

  it('el doble toque en "Sí, desactivar" produce un solo PATCH', async () => {
    const { waiting, release } = gate();
    const calls: JsonValue[] = [];
    server.use(
      http.patch('*/api/tables/1', async ({ request }) => {
        calls.push((await request.json()) as JsonValue);
        await waiting;
        return HttpResponse.json({ ...MESA2, isActive: false });
      }),
    );
    show(<MesasPage />);
    await screen.findByText('Mesa 3');
    fireEvent.click(within(tableRow('Mesa 2')).getByRole('button', { name: 'Desactivar' }));
    const confirm = await screen.findByRole('button', { name: 'Sí, desactivar' });
    act(() => {
      fireEvent.click(confirm);
      fireEvent.click(confirm);
    });
    release();
    await waitFor(() => expect(calls).toEqual([{ isActive: false }]));
  });

  it('el doble toque en "Activar" produce un solo PATCH', async () => {
    const { waiting, release } = gate();
    const calls: JsonValue[] = [];
    server.use(
      http.patch('*/api/tables/5', async ({ request }) => {
        calls.push((await request.json()) as JsonValue);
        await waiting;
        return HttpResponse.json({ ...MESA10, isActive: true });
      }),
    );
    show(<MesasPage />);
    await screen.findByText('Mesa 3');
    const button = within(tableRow('Mesa 10')).getByRole('button', { name: 'Activar' });
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    release();
    await waitFor(() => expect(calls).toEqual([{ isActive: true }]));
  });
});

describe('ADV-012-05: tras un fallo el guard se libera y el borrador se conserva', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/admin/mesas');
    mockSession();
    mockTables();
  });

  it('un fallo de red en el alta libera el botón y el reintento envía de nuevo', async () => {
    let calls = 0;
    const created = { id: 9, name: 'Balcón 1', isActive: true, state: 'free', order: null };
    server.use(
      http.post('*/api/tables', () => {
        calls += 1;
        return calls === 1 ? HttpResponse.error() : HttpResponse.json(created, { status: 201 });
      }),
    );
    show(<MesasPage />);
    await screen.findByText('Mesa 3');
    fireEvent.change(screen.getByLabelText('Nombre de la mesa'), {
      target: { value: 'Balcón 1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar mesa' }));
    expect(await screen.findByText(NETWORK)).toBeVisible();
    expect(screen.getByLabelText('Nombre de la mesa')).toHaveValue('Balcón 1');
    // El mismo botón, ya liberado, reenvía el mismo intento.
    fireEvent.click(screen.getByRole('button', { name: 'Agregar mesa' }));
    await screen.findByText('Balcón 1');
    expect(within(tableRow('Balcón 1')).getByText('Libre')).toBeVisible();
    expect(calls).toBe(2);
  });

  it('un 409 al desactivar libera el guard: se puede reintentar y sale el segundo PATCH', async () => {
    let calls = 0;
    server.use(
      http.patch('*/api/tables/1', () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json(
              errorBody(
                'TABLE_HAS_OPEN_ORDER',
                'La mesa tiene un pedido abierto; ciérralo o muévelo antes de desactivarla.',
              ),
              { status: 409 },
            )
          : HttpResponse.json({ ...MESA2, isActive: false });
      }),
    );
    show(<MesasPage />);
    await screen.findByText('Mesa 3');
    const row = tableRow('Mesa 2');
    fireEvent.click(within(row).getByRole('button', { name: 'Desactivar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, desactivar' }));
    expect(await screen.findByText(/pedido abierto/)).toBeVisible();
    // Reintentar el mismo flujo funciona: nueva confirmación y nuevo PATCH.
    fireEvent.click(within(tableRow('Mesa 2')).getByRole('button', { name: 'Desactivar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, desactivar' }));
    await within(tableRow('Mesa 2')).findByText('Desactivada');
    expect(calls).toBe(2);
  });
});

describe('ADV-012-06: nombres hostiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/admin/mesas');
    mockSession();
    mockTables();
  });

  it.each([
    ['  Mesa   9  ', 'Mesa 9'],
    ['Cafe\u0301', 'Café'],
    // Las letras y dígitos árabes pertenecen a la clase del esquema (decisión de
    // shared): pasan la validación local y llegan al servidor tal cual.
    ['ميسا ٢', 'ميسا ٢'],
    // 40 caracteres exactos: el tope del esquema sí se acepta.
    [`Mesa ${'x'.repeat(35)}`, `Mesa ${'x'.repeat(35)}`],
  ])('el nombre %j se envía al servidor ya normalizado como %j', async (raw, sent) => {
    const bodies: JsonValue[] = [];
    const created = { id: 9, name: sent, isActive: true, state: 'free', order: null };
    server.use(
      http.post('*/api/tables', async ({ request }) => {
        bodies.push((await request.json()) as JsonValue);
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    show(<MesasPage />);
    await screen.findByText('Mesa 3');
    fireEvent.change(screen.getByLabelText('Nombre de la mesa'), {
      target: { value: raw },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar mesa' }));
    await waitFor(() => expect(bodies).toEqual([{ name: sent }]));
  });

  it.each([
    ['control bidi', '\u202eMesa'],
    ['tabulación', 'Mesa\t9'],
    ['etiquetas', '<script>alert(1)</script>'],
    ['emoji', 'Mesa 😀'],
    ['solo espacios', '     '],
  ])('el nombre %s se corta en local y no sale petición', async (_case, raw) => {
    const calls = vi.fn();
    server.use(
      http.post('*/api/tables', () => {
        calls();
        return HttpResponse.json(MESA2, { status: 201 });
      }),
    );
    show(<MesasPage />);
    await screen.findByText('Mesa 3');
    fireEvent.change(screen.getByLabelText('Nombre de la mesa'), {
      target: { value: raw },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar mesa' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(calls).not.toHaveBeenCalled();
  });
});

describe('ADV-012-07: sesión vencida con la pantalla abierta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/admin/mesas');
    mockSession();
    mockTables();
  });

  it('un 401 en el PATCH lleva a /login', async () => {
    server.use(
      http.patch('*/api/tables/1', () =>
        HttpResponse.json(errorBody('UNAUTHENTICATED', 'Tu sesión venció.'), { status: 401 }),
      ),
    );
    show(<MesasPage />);
    await screen.findByText('Mesa 3');
    fireEvent.click(within(tableRow('Mesa 2')).getByRole('button', { name: 'Desactivar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, desactivar' }));
    await waitFor(() => {
      expect(hardNavigate).toHaveBeenCalledWith('/login');
    });
  });

  it('un 401 en el POST lleva a /login', async () => {
    server.use(
      http.post('*/api/tables', () =>
        HttpResponse.json(errorBody('UNAUTHENTICATED', 'Tu sesión venció.'), { status: 401 }),
      ),
    );
    show(<MesasPage />);
    await screen.findByText('Mesa 3');
    fireEvent.change(screen.getByLabelText('Nombre de la mesa'), {
      target: { value: 'Balcón' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar mesa' }));
    await waitFor(() => {
      expect(hardNavigate).toHaveBeenCalledWith('/login');
    });
  });
});

describe('ADV-012-08: respuestas fuera de esquema o errores malformados', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/admin/mesas');
    mockSession();
    mockTables();
  });

  it('un 201 sin forma de mesa muestra el mensaje genérico y la lista sigue intacta', async () => {
    server.use(http.post('*/api/tables', () => HttpResponse.json({ id: 9 }, { status: 201 })));
    show(<MesasPage />);
    await screen.findByText('Mesa 3');
    fireEvent.change(screen.getByLabelText('Nombre de la mesa'), {
      target: { value: 'Balcón' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar mesa' }));
    expect(await screen.findByText(UNEXPECTED)).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Renombrar' })).toHaveLength(TABLES.length);
  });

  it('un 200 de PATCH sin forma de mesa muestra el mensaje genérico y la fila no cambia', async () => {
    server.use(http.patch('*/api/tables/1', () => HttpResponse.json({ id: 1, name: 'Barra' })));
    show(<MesasPage />);
    await screen.findByText('Mesa 3');
    fireEvent.click(within(tableRow('Mesa 2')).getByRole('button', { name: 'Renombrar' }));
    fireEvent.change(within(renamePanel()).getByLabelText('Nombre de la mesa'), {
      target: { value: 'Barra' },
    });
    fireEvent.click(within(renamePanel()).getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(UNEXPECTED)).toBeVisible();
    expect(within(tableRow('Mesa 2')).getByText('Libre')).toBeVisible();
  });

  it('un 400 VALIDATION_ERROR con details sin issues muestra el message del servidor', async () => {
    server.use(
      http.patch('*/api/tables/1', () =>
        HttpResponse.json(errorBody('VALIDATION_ERROR', 'Datos inválidos.', {}), { status: 400 }),
      ),
    );
    show(<MesasPage />);
    await screen.findByText('Mesa 3');
    fireEvent.click(within(tableRow('Mesa 2')).getByRole('button', { name: 'Renombrar' }));
    fireEvent.change(within(renamePanel()).getByLabelText('Nombre de la mesa'), {
      target: { value: 'Barra' },
    });
    fireEvent.click(within(renamePanel()).getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Datos inválidos.')).toBeVisible();
  });

  it('un 400 con details fuera de esquema muestra el mensaje genérico', async () => {
    server.use(
      http.patch('*/api/tables/1', () =>
        HttpResponse.json(errorBody('VALIDATION_ERROR', 'Datos inválidos.', 'basura'), {
          status: 400,
        }),
      ),
    );
    show(<MesasPage />);
    await screen.findByText('Mesa 3');
    fireEvent.click(within(tableRow('Mesa 2')).getByRole('button', { name: 'Renombrar' }));
    fireEvent.change(within(renamePanel()).getByLabelText('Nombre de la mesa'), {
      target: { value: 'Barra' },
    });
    fireEvent.click(within(renamePanel()).getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(UNEXPECTED)).toBeVisible();
  });

  it('un 409 con un cuerpo que no es el formato de error muestra el mensaje genérico', async () => {
    server.use(http.post('*/api/tables', () => HttpResponse.json({ raro: true }, { status: 409 })));
    show(<MesasPage />);
    await screen.findByText('Mesa 3');
    fireEvent.change(screen.getByLabelText('Nombre de la mesa'), {
      target: { value: 'Mesa 3' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar mesa' }));
    expect(await screen.findByText(UNEXPECTED)).toBeVisible();
  });
});

describe('ADV-012-09: dos "Desactivar" en filas distintas viajan en paralelo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/admin/mesas');
    mockSession();
    mockTables();
  });

  it('los dos PATCH salen a la vez y ambas filas quedan desactivadas', async () => {
    const { waiting, release } = gate();
    const calls: JsonValue[] = [];
    server.use(
      http.patch('*/api/tables/1', async ({ request }) => {
        calls.push((await request.json()) as JsonValue);
        await waiting;
        return HttpResponse.json({ ...MESA2, isActive: false });
      }),
      http.patch('*/api/tables/4', async ({ request }) => {
        calls.push((await request.json()) as JsonValue);
        await waiting;
        return HttpResponse.json({ ...MESA4, isActive: false });
      }),
    );
    show(<MesasPage />);
    await screen.findByText('Mesa 3');
    fireEvent.click(within(tableRow('Mesa 2')).getByRole('button', { name: 'Desactivar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, desactivar' }));
    // Con el primer PATCH retenido, la otra fila sigue operable.
    fireEvent.click(within(tableRow('Mesa 4')).getByRole('button', { name: 'Desactivar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, desactivar' }));
    await waitFor(() => expect(calls).toHaveLength(2));
    release();
    await within(tableRow('Mesa 2')).findByText('Desactivada');
    await within(tableRow('Mesa 4')).findByText('Desactivada');
  });
});

describe('ADV-012-10: el diálogo de renombrado y sus controles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/admin/mesas');
    mockSession();
    mockTables();
  });

  it('el nombre accesible "Guardar" se mantiene durante el envío', async () => {
    const { waiting, release } = gate();
    server.use(
      http.patch('*/api/tables/1', async () => {
        await waiting;
        return HttpResponse.json({ ...MESA2, name: 'Barra' });
      }),
    );
    show(<MesasPage />);
    await screen.findByText('Mesa 3');
    fireEvent.click(within(tableRow('Mesa 2')).getByRole('button', { name: 'Renombrar' }));
    fireEvent.change(within(renamePanel()).getByLabelText('Nombre de la mesa'), {
      target: { value: 'Barra' },
    });
    fireEvent.click(within(renamePanel()).getByRole('button', { name: 'Guardar' }));
    // Muestra 'Guardando...' pero el nombre accesible sigue siendo 'Guardar'.
    const pending = await screen.findByRole('button', { name: 'Guardar' });
    expect(pending).toBeDisabled();
    release();
    await screen.findByText('Barra');
    expect(within(tableRow('Barra')).getByText('Libre')).toBeVisible();
  });

  it('el diálogo abierto sobrevive a la releída de la lista con su borrador', async () => {
    let tables = structuredClone(TABLES);
    server.use(
      http.get('*/api/tables', () => HttpResponse.json({ tables })),
      http.patch('*/api/tables/4', async ({ request }) => {
        const body = (await request.json()) as Record<string, JsonValue>;
        tables = tables.map((table) => (table.id === 4 ? { ...table, ...body } : table));
        return HttpResponse.json(tables.find((table) => table.id === 4));
      }),
    );
    show(<MesasPage />);
    await screen.findByText('Mesa 3');
    fireEvent.click(within(tableRow('Mesa 2')).getByRole('button', { name: 'Renombrar' }));
    fireEvent.change(within(renamePanel()).getByLabelText('Nombre de la mesa'), {
      target: { value: 'Borrador' },
    });
    // Otra acción muta la lista (desactivar Mesa 4) y la relee.
    fireEvent.click(within(tableRow('Mesa 4')).getByRole('button', { name: 'Desactivar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, desactivar' }));
    await within(tableRow('Mesa 4')).findByText('Desactivada');
    // El panel sigue abierto con el borrador intacto.
    expect(within(renamePanel()).getByLabelText('Nombre de la mesa')).toHaveValue('Borrador');
  });
});

describe('ADV-012-11: la mesa ocupada conserva sus acciones de admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/admin/mesas');
    mockSession();
    mockTables();
  });

  it('renombrar responde 200 conservando "Ocupada" y desactivar responde su 409', async () => {
    let calls = 0;
    server.use(
      http.patch('*/api/tables/2', async ({ request }) => {
        calls += 1;
        const body = (await request.json()) as Record<string, JsonValue>;
        if (calls === 1) return HttpResponse.json({ ...MESA3, ...body });
        return HttpResponse.json(
          errorBody(
            'TABLE_HAS_OPEN_ORDER',
            'La mesa tiene un pedido abierto; ciérralo o muévelo antes de desactivarla.',
          ),
          { status: 409 },
        );
      }),
    );
    show(<MesasPage />);
    await screen.findByText('Mesa 3');
    const row = tableRow('Mesa 3');
    expect(within(row).getByText('Ocupada')).toBeVisible();
    // Renombrar está permitido aun con pedido abierto (D-012-04).
    fireEvent.click(within(row).getByRole('button', { name: 'Renombrar' }));
    fireEvent.change(within(renamePanel()).getByLabelText('Nombre de la mesa'), {
      target: { value: 'Mesa Cubierta' },
    });
    fireEvent.click(within(renamePanel()).getByRole('button', { name: 'Guardar' }));
    await screen.findByText('Mesa Cubierta');
    expect(within(tableRow('Mesa Cubierta')).getByText('Ocupada')).toBeVisible();
    // Desactivar sigue ofrecido y muestra el 409 tal cual.
    fireEvent.click(within(tableRow('Mesa Cubierta')).getByRole('button', { name: 'Desactivar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, desactivar' }));
    expect(await screen.findByText(/pedido abierto/)).toBeVisible();
    expect(within(tableRow('Mesa Cubierta')).getByText('Ocupada')).toBeVisible();
  });
});

describe('ADV-012-12: el alta nueva y la releída', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/admin/mesas');
    mockSession();
  });

  it('la mesa aparece aunque la releída aún no la traiga y no se duplica cuando llega', async () => {
    const created = { id: 9, name: 'Balcón 1', isActive: true, state: 'free', order: null };
    let tables = structuredClone(TABLES);
    server.use(
      http.get('*/api/tables', () => HttpResponse.json({ tables })),
      http.post('*/api/tables', () => HttpResponse.json(created, { status: 201 })),
    );
    const view = show(<MesasPage />);
    await screen.findByText('Mesa 3');
    fireEvent.change(screen.getByLabelText('Nombre de la mesa'), {
      target: { value: 'Balcón 1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar mesa' }));
    // Lag de lectura: la releída vuelve sin la mesa nueva; el overlay la muestra igual.
    await screen.findByText('Balcón 1');
    expect(within(tableRow('Balcón 1')).getByText('Libre')).toBeVisible();
    // Cuando la releída por fin la trae, la fila aparece una sola vez.
    tables = [...tables, created];
    await view.client.invalidateQueries({ queryKey: ['admin', 'tables'] });
    await waitFor(() => {
      expect(screen.queryAllByText('Balcón 1')).toHaveLength(1);
    });
  });
});

describe('ADV-012-13: "Guardar" solo se habilita con un cambio real', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/admin/mesas');
    mockSession();
  });

  it('un nombre que solo difiere en la forma Unicode (NFD vs NFC) sigue inhabilitado', async () => {
    const cafe = { id: 8, name: 'Café 1', isActive: true, state: 'free', order: null };
    mockTables([cafe]);
    show(<MesasPage />);
    await screen.findByText('Café 1');
    fireEvent.click(within(tableRow('Café 1')).getByRole('button', { name: 'Renombrar' }));
    fireEvent.change(within(renamePanel()).getByLabelText('Nombre de la mesa'), {
      // 'Café 1' en NFD: se ve igual pero llega descompuesto; el esquema normaliza.
      target: { value: 'Cafe\u0301 1' },
    });
    expect(within(renamePanel()).getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });

  it('un mozo con sesión no ve la pantalla: RoleGuard lo lleva a /mozo', async () => {
    mockSession(SESSION_WAITER);
    mockTables();
    show(<MesasPage />);
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/mozo');
    });
    expect(screen.queryByRole('heading', { name: 'Mesas', level: 1 })).toBeNull();
  });
});
