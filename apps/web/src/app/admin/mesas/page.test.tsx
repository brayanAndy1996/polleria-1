// AC-02 a AC-10. Spec 012 — archivo nuevo: va EN ROJO hasta que T-07 cree
// apps/web/src/app/admin/mesas/page.tsx (hoy no existe: el rojo es por ausencia
// del módulo). MSW sirve la lista y responde POST/PATCH /api/tables; cada prueba
// lleva su AC y los textos son los fijados en la spec §4/§10.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, delay, http } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../../tests/msw-server.ts';
import { hardNavigate } from '../../../lib/navigation.ts';
import MesasPage from './page.tsx';

const mocks = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock('../../../lib/navigation.ts', () => ({ hardNavigate: vi.fn() }));

const SESSION_ADMIN = {
  user: { id: 1, username: 'dueno', displayName: 'Carlos', roles: ['admin'] },
  expiresAt: '2026-10-12T07:00:00.000Z',
};
const SESSION_WAITER = {
  user: { id: 7, username: 'mozo.juan', displayName: 'Juan', roles: ['waiter'] },
  expiresAt: '2026-10-12T07:00:00.000Z',
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
// La lista tal como la devuelve la API: todas las mesas —activas e inactivas— en
// su orden por nombre natural, con el estado derivado de cada activa.
const TABLES = [
  { id: 1, name: 'Mesa 2', isActive: true, state: 'free', order: null },
  { id: 2, name: 'Mesa 3', isActive: true, state: 'occupied', order: ORDER },
  {
    id: 3,
    name: 'Mesa 4',
    isActive: true,
    state: 'ready',
    order: { ...ORDER, readyAt: '2026-10-11T15:20:00.000Z' },
  },
  {
    id: 4,
    name: 'Mesa 5',
    isActive: true,
    state: 'bill_requested',
    order: { ...ORDER, billRequestedAt: '2026-10-11T15:25:00.000Z' },
  },
  { id: 5, name: 'Mesa 10', isActive: false, state: 'free', order: null },
];
const errorBody = (code: string, message = 'Mensaje.', details: unknown = null) => ({
  error: { code, message, details },
});
const NETWORK = 'Sin conexión con el servidor. Revisa el wifi e intenta de nuevo.';
// Mensajes de tableNameSchema (packages/shared/src/tables.ts): no se exportan,
// así que se repiten aquí tal cual los define el esquema.
const NAME_PATTERN_MESSAGE =
  'El nombre de la mesa solo puede llevar letras, números, espacios, punto, guion o ' +
  'guion bajo.';
const NAME_TOO_LONG_MESSAGE = 'El nombre de la mesa no puede pasar de 40 caracteres.';

function show(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
function mockSession(session: unknown = SESSION_ADMIN) {
  server.use(http.get('*/api/auth/me', () => HttpResponse.json(session as object)));
}
function mockTables(tables: unknown = TABLES) {
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
/** Contenedor de un diálogo/panel: el ancestro del título que tiene el botón dado. */
function panelScope(title: string | RegExp, buttonName: string): HTMLElement {
  let element: HTMLElement | null = screen.getByText(title);
  while (element !== null) {
    if (within(element).queryByRole('button', { name: buttonName }) !== null) break;
    element = element.parentElement;
  }
  expect(element, `panel ${String(title)}`).not.toBeNull();
  return element as HTMLElement;
}
function renamePanel(): HTMLElement {
  return panelScope('Renombrar mesa', 'Guardar');
}

describe('012: lista, navegación y guardia de /admin/mesas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/admin/mesas');
    mockSession();
    mockTables();
  });

  it('AC-04: exige el rol admin (un mozo va a /mozo) y sin sesión recarga en /login', async () => {
    server.use(http.get('*/api/auth/me', () => HttpResponse.json(SESSION_WAITER)));
    show(<MesasPage />);
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/mozo');
    });
    expect(
      screen.queryByRole('heading', { name: 'Mesas', level: 1 }),
    ).not.toBeInTheDocument();
    mocks.replace.mockClear();
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json(errorBody('UNAUTHENTICATED'), { status: 401 }),
      ),
    );
    show(<MesasPage />);
    await waitFor(() => {
      expect(hardNavigate).toHaveBeenCalledWith('/login');
    });
    expect(
      screen.queryByRole('heading', { name: 'Mesas', level: 1 }),
    ).not.toBeInTheDocument();
  });

  it('AC-02: una fila por mesa —activas e inactivas en el orden recibido— con estado y acciones', async () => {
    show(<MesasPage />);
    expect(await screen.findByRole('heading', { name: 'Mesas', level: 1 })).toBeVisible();
    // Una fila por mesa en el orden que devuelve la API.
    for (const [index, table] of TABLES.entries()) {
      if (index === 0) continue;
      const previous = screen.getByText(TABLES[index - 1]!.name);
      const current = screen.getByText(table.name);
      expect(
        previous.compareDocumentPosition(current) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    // Activas: etiqueta del estado derivado + 'Renombrar' + 'Desactivar'.
    const libre = tableRow('Mesa 2');
    expect(within(libre).getByText('Libre')).toBeVisible();
    expect(within(libre).queryByText('Desactivada')).not.toBeInTheDocument();
    expect(within(libre).getByRole('button', { name: 'Renombrar' })).toBeInTheDocument();
    expect(within(libre).getByRole('button', { name: 'Desactivar' })).toBeInTheDocument();
    expect(within(libre).queryByRole('button', { name: 'Activar' })).not.toBeInTheDocument();
    expect(within(tableRow('Mesa 3')).getByText('Ocupada')).toBeVisible();
    expect(within(tableRow('Mesa 4')).getByText('Pedido listo')).toBeVisible();
    expect(within(tableRow('Mesa 5')).getByText('Pidió la cuenta')).toBeVisible();
    // Inactiva: marca 'Desactivada' sin etiqueta de estado, con 'Activar'.
    const inactiva = tableRow('Mesa 10');
    expect(within(inactiva).getByText('Desactivada')).toBeVisible();
    expect(within(inactiva).queryByText('Libre')).not.toBeInTheDocument();
    expect(within(inactiva).getByRole('button', { name: 'Renombrar' })).toBeInTheDocument();
    expect(within(inactiva).getByRole('button', { name: 'Activar' })).toBeInTheDocument();
    expect(within(inactiva).queryByRole('button', { name: 'Desactivar' })).not.toBeInTheDocument();
    // El bloque de alta en línea está al inicio de la pantalla.
    expect(screen.getByLabelText('Nombre de la mesa')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Agregar mesa' })).toBeVisible();
  });

  it('AC-02: la pantalla no ofrece acciones del ciclo del pedido (RN-012-03)', async () => {
    show(<MesasPage />);
    await screen.findByRole('heading', { name: 'Mesas', level: 1 });
    for (const name of [
      'Abrir mesa',
      'Unir mesa',
      'Mover a otra mesa',
      'Separar',
      'Marcar pedido listo',
      'Marcar servido',
      'Pedir la cuenta',
      'Cancelar pedido',
      'Agregar ítems',
      'Solicitar anulación',
      'Aprobar anulación',
      'Enviar a cocina',
    ]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
    }
  });

  it('AC-03: muestra "Cargando mesas..." mientras llega la lista', async () => {
    server.use(
      http.get('*/api/tables', async () => {
        await delay('infinite');
        return HttpResponse.json({ tables: [] });
      }),
    );
    show(<MesasPage />);
    // La sesión sí responde: el estado visible es el de la lista, no el de la guardia.
    expect(await screen.findByText('Carlos · Administrador')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Cargando mesas...');
  });

  it.each(['500', 'red'])(
    'AC-03: un fallo %s de la API muestra el error y Reintentar vuelve a consultar',
    async (kind) => {
      const fail = () =>
        kind === 'red'
          ? HttpResponse.error()
          : HttpResponse.json(errorBody('INTERNAL_ERROR'), { status: 500 });
      server.use(http.get('*/api/tables', fail));
      show(<MesasPage />);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'No se pudo cargar la lista de mesas.',
      );
      server.use(http.get('*/api/tables', () => HttpResponse.json({ tables: TABLES })));
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
      expect(await screen.findByRole('heading', { name: 'Mesas', level: 1 })).toBeVisible();
      expect(screen.getByText('Mesa 3')).toBeVisible();
    },
  );

  it('AC-03: con la lista vacía muestra el estado vacío y mantiene el alta en línea', async () => {
    mockTables([]);
    show(<MesasPage />);
    expect(await screen.findByRole('heading', { name: 'Mesas', level: 1 })).toBeVisible();
    expect(screen.getByText('Todavía no hay mesas.')).toBeVisible();
    expect(screen.getByLabelText('Nombre de la mesa')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Agregar mesa' })).toBeVisible();
  });

  it('AC-03: un ApiError UNAUTHENTICATED de la consulta lleva a /login', async () => {
    server.use(
      http.get('*/api/tables', () =>
        HttpResponse.json(errorBody('UNAUTHENTICATED'), { status: 401 }),
      ),
    );
    show(<MesasPage />);
    await waitFor(() => {
      expect(hardNavigate).toHaveBeenCalledWith('/login');
    });
  });
});

describe('012: alta en línea y renombrado en /admin/mesas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/admin/mesas');
    mockSession();
    mockTables();
  });

  it('AC-05: el alta envía un solo POST aunque se toque dos veces; tras el 201 la mesa aparece y el campo queda limpio', async () => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls: unknown[] = [];
    const created = { id: 12, name: 'Balcón 1', isActive: true, state: 'free', order: null };
    let tables = structuredClone(TABLES);
    server.use(
      http.get('*/api/tables', () => HttpResponse.json({ tables })),
      http.post('*/api/tables', async ({ request }) => {
        calls.push(await request.json());
        await waiting;
        tables = [...tables, created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    show(<MesasPage />);
    await screen.findByRole('heading', { name: 'Mesas', level: 1 });
    fireEvent.change(screen.getByLabelText('Nombre de la mesa'), {
      target: { value: 'Balcón 1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar mesa' }));
    // Mientras envía el botón queda inhabilitado ('Agregando...'): el segundo toque no sale.
    const sending = await screen.findByRole('button', { name: 'Agregando...' });
    expect(sending).toBeDisabled();
    fireEvent.click(sending);
    release();
    await waitFor(() => {
      expect(calls).toEqual([{ name: 'Balcón 1' }]);
    });
    // La lista se relee tras la mutación y la fila nueva muestra su estado inicial.
    expect(await within(tableRow('Balcón 1')).findByText('Libre')).toBeVisible();
    expect(screen.getByLabelText('Nombre de la mesa')).toHaveValue('');
  });

  it.each([
    ['vacío', '', NAME_PATTERN_MESSAGE],
    ['con caracteres fuera de la clase', 'Mesa <3>', NAME_PATTERN_MESSAGE],
    ['con emoji', 'Mesa 😀', NAME_PATTERN_MESSAGE],
    ['de más de 40 caracteres', 'Un nombre de mesa que se pasa de los cuarenta', NAME_TOO_LONG_MESSAGE],
  ])(
    'AC-06: el nombre %s se corta en local con el mensaje del esquema junto al campo y no llama a la API',
    async (_case, name, message) => {
      const calls = vi.fn();
      server.use(
        http.post('*/api/tables', () => {
          calls();
          return HttpResponse.json(TABLES[0], { status: 201 });
        }),
      );
      show(<MesasPage />);
      await screen.findByRole('heading', { name: 'Mesas', level: 1 });
      fireEvent.change(screen.getByLabelText('Nombre de la mesa'), {
        target: { value: name },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Agregar mesa' }));
      expect(await screen.findByText(message)).toBeVisible();
      expect(calls).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      409,
      errorBody('TABLE_NAME_TAKEN', 'Ya existe una mesa con ese nombre.'),
      'Ya existe una mesa con ese nombre.',
    ],
    [0, null, NETWORK],
  ])(
    'AC-06: el error %s del alta se muestra junto al campo, conserva lo escrito y la lista no cambia',
    async (status, body, message) => {
      server.use(
        http.post('*/api/tables', () =>
          status === 0 ? HttpResponse.error() : HttpResponse.json(body as object, { status }),
        ),
      );
      show(<MesasPage />);
      await screen.findByRole('heading', { name: 'Mesas', level: 1 });
      fireEvent.change(screen.getByLabelText('Nombre de la mesa'), {
        target: { value: 'Balcón 1' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Agregar mesa' }));
      expect(await screen.findByText(message)).toBeVisible();
      expect(screen.getByLabelText('Nombre de la mesa')).toHaveValue('Balcón 1');
      // La mesa no se agregó: siguen las mismas cinco filas.
      expect(screen.getAllByRole('button', { name: 'Renombrar' })).toHaveLength(TABLES.length);
    },
  );

  it('AC-07: Renombrar abre el diálogo con el nombre precargado y Guardar inhabilitado mientras el nombre no cambie (recortado)', async () => {
    const calls = vi.fn();
    server.use(
      http.patch('*/api/tables/2', () => {
        calls();
        return HttpResponse.json(TABLES[1]);
      }),
    );
    show(<MesasPage />);
    await screen.findByText('Mesa 3');
    fireEvent.click(within(tableRow('Mesa 3')).getByRole('button', { name: 'Renombrar' }));
    const panel = renamePanel();
    const field = within(panel).getByLabelText('Nombre de la mesa');
    expect(field).toHaveValue('Mesa 3');
    expect(within(panel).getByRole('button', { name: 'Guardar' })).toBeDisabled();
    // Un nombre que solo cambia en espacios alrededor sigue contando como "sin cambios".
    fireEvent.change(field, { target: { value: '  Mesa 3  ' } });
    expect(within(panel).getByRole('button', { name: 'Guardar' })).toBeDisabled();
    // Cancelar cierra sin enviar nada.
    fireEvent.click(within(panel).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => {
      expect(screen.queryByText('Renombrar mesa')).not.toBeInTheDocument();
    });
    expect(calls).not.toHaveBeenCalled();
    expect(within(tableRow('Mesa 3')).getByText('Ocupada')).toBeVisible();
  });

  it('AC-07: con un nombre nuevo envía PATCH { name } y la fila muestra el nombre nuevo', async () => {
    let tables = structuredClone(TABLES);
    const calls: unknown[] = [];
    server.use(
      http.get('*/api/tables', () => HttpResponse.json({ tables })),
      http.patch('*/api/tables/1', async ({ request }) => {
        const body = await request.json();
        calls.push(body);
        tables = tables.map((table) =>
          table.id === 1 ? { ...table, ...(body as object) } : table,
        );
        return HttpResponse.json(tables.find((table) => table.id === 1));
      }),
    );
    show(<MesasPage />);
    await screen.findByText('Mesa 2');
    fireEvent.click(within(tableRow('Mesa 2')).getByRole('button', { name: 'Renombrar' }));
    const panel = renamePanel();
    fireEvent.change(within(panel).getByLabelText('Nombre de la mesa'), {
      target: { value: 'Mesa Nueva' },
    });
    fireEvent.click(within(panel).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => {
      expect(calls).toEqual([{ name: 'Mesa Nueva' }]);
    });
    expect(await within(tableRow('Mesa Nueva')).findByText('Libre')).toBeVisible();
  });

  it('AC-08: el 409 TABLE_NAME_TAKEN se muestra junto al campo y la fila conserva el nombre anterior', async () => {
    server.use(
      http.patch('*/api/tables/2', () =>
        HttpResponse.json(errorBody('TABLE_NAME_TAKEN', 'Ya existe una mesa con ese nombre.'), {
          status: 409,
        }),
      ),
    );
    show(<MesasPage />);
    await screen.findByText('Mesa 3');
    fireEvent.click(within(tableRow('Mesa 3')).getByRole('button', { name: 'Renombrar' }));
    const panel = renamePanel();
    fireEvent.change(within(panel).getByLabelText('Nombre de la mesa'), {
      target: { value: 'Mesa 2' },
    });
    fireEvent.click(within(panel).getByRole('button', { name: 'Guardar' }));
    expect(
      await within(renamePanel()).findByText('Ya existe una mesa con ese nombre.'),
    ).toBeVisible();
    // La fila sigue con el nombre anterior y su estado.
    expect(within(tableRow('Mesa 3')).getByText('Ocupada')).toBeVisible();
  });

  it('AC-08: renombrar una mesa con pedido abierto responde 200 y la fila cambia con normalidad', async () => {
    let tables = structuredClone(TABLES);
    const calls: unknown[] = [];
    server.use(
      http.get('*/api/tables', () => HttpResponse.json({ tables })),
      http.patch('*/api/tables/2', async ({ request }) => {
        const body = await request.json();
        calls.push(body);
        tables = tables.map((table) =>
          table.id === 2 ? { ...table, ...(body as object) } : table,
        );
        return HttpResponse.json(tables.find((table) => table.id === 2));
      }),
    );
    show(<MesasPage />);
    await screen.findByText('Mesa 3');
    fireEvent.click(within(tableRow('Mesa 3')).getByRole('button', { name: 'Renombrar' }));
    const panel = renamePanel();
    fireEvent.change(within(panel).getByLabelText('Nombre de la mesa'), {
      target: { value: 'Mesa Cubierta' },
    });
    fireEvent.click(within(panel).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => {
      expect(calls).toEqual([{ name: 'Mesa Cubierta' }]);
    });
    // La fila conserva su estado derivado (la mesa sigue ocupada).
    expect(await within(tableRow('Mesa Cubierta')).findByText('Ocupada')).toBeVisible();
  });

  it('AC-08: un 404 al renombrar muestra "Esa mesa no existe."', async () => {
    server.use(
      http.patch('*/api/tables/1', () =>
        HttpResponse.json(errorBody('TABLE_NOT_FOUND', 'Esa mesa no existe.'), { status: 404 }),
      ),
    );
    show(<MesasPage />);
    await screen.findByText('Mesa 2');
    fireEvent.click(within(tableRow('Mesa 2')).getByRole('button', { name: 'Renombrar' }));
    const panel = renamePanel();
    fireEvent.change(within(panel).getByLabelText('Nombre de la mesa'), {
      target: { value: 'Mesa Nueva' },
    });
    fireEvent.click(within(panel).getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Esa mesa no existe.')).toBeVisible();
  });

  it('AC-08: la validación local corta el nombre inválido del diálogo igual que en el alta', async () => {
    const calls = vi.fn();
    server.use(
      http.patch('*/api/tables/1', () => {
        calls();
        return HttpResponse.json(TABLES[0]);
      }),
    );
    show(<MesasPage />);
    await screen.findByText('Mesa 2');
    fireEvent.click(within(tableRow('Mesa 2')).getByRole('button', { name: 'Renombrar' }));
    const panel = renamePanel();
    fireEvent.change(within(panel).getByLabelText('Nombre de la mesa'), {
      target: { value: 'Mesa <3>' },
    });
    fireEvent.click(within(panel).getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(NAME_PATTERN_MESSAGE)).toBeVisible();
    expect(calls).not.toHaveBeenCalled();
  });
});

describe('012: activar y desactivar en /admin/mesas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/admin/mesas');
    mockSession();
    mockTables();
  });

  it('AC-09: Desactivar pide la confirmación y al confirmar la fila pasa a Desactivada con Activar', async () => {
    let tables = structuredClone(TABLES);
    const calls: unknown[] = [];
    server.use(
      http.get('*/api/tables', () => HttpResponse.json({ tables })),
      http.patch('*/api/tables/1', async ({ request }) => {
        const body = await request.json();
        calls.push(body);
        tables = tables.map((table) =>
          table.id === 1 ? { ...table, ...(body as object) } : table,
        );
        return HttpResponse.json(tables.find((table) => table.id === 1));
      }),
    );
    show(<MesasPage />);
    await screen.findByText('Mesa 2');
    const row = tableRow('Mesa 2');
    fireEvent.click(within(row).getByRole('button', { name: 'Desactivar' }));
    await waitFor(() => {
      expect(document.body.textContent).toContain(
        '¿Desactivar Mesa 2? No aparecerá en el tablero del mozo.',
      );
    });
    // La confirmación no envía nada hasta 'Sí, desactivar'.
    expect(calls).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Sí, desactivar' }));
    await waitFor(() => {
      expect(calls).toEqual([{ isActive: false }]);
    });
    const updated = tableRow('Mesa 2');
    expect(await within(updated).findByText('Desactivada')).toBeVisible();
    expect(within(updated).queryByText('Libre')).not.toBeInTheDocument();
    expect(within(updated).getByRole('button', { name: 'Activar' })).toBeVisible();
  });

  it('AC-09: Cancelar en la confirmación no envía nada y la fila sigue activa', async () => {
    const calls = vi.fn();
    server.use(
      http.patch('*/api/tables/1', () => {
        calls();
        return HttpResponse.json({ ...TABLES[0], isActive: false });
      }),
    );
    show(<MesasPage />);
    await screen.findByText('Mesa 2');
    const row = tableRow('Mesa 2');
    fireEvent.click(within(row).getByRole('button', { name: 'Desactivar' }));
    await waitFor(() => {
      expect(document.body.textContent).toContain('¿Desactivar Mesa 2?');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(calls).not.toHaveBeenCalled();
    expect(within(row).queryByText('Desactivada')).not.toBeInTheDocument();
    expect(within(row).getByText('Libre')).toBeVisible();
  });

  it('AC-10: el 409 TABLE_HAS_OPEN_ORDER muestra su mensaje y la fila sigue activa', async () => {
    server.use(
      http.patch('*/api/tables/2', () =>
        HttpResponse.json(
          errorBody(
            'TABLE_HAS_OPEN_ORDER',
            'La mesa tiene un pedido abierto; ciérralo o muévelo antes de desactivarla.',
          ),
          { status: 409 },
        ),
      ),
    );
    show(<MesasPage />);
    await screen.findByText('Mesa 3');
    const row = tableRow('Mesa 3');
    fireEvent.click(within(row).getByRole('button', { name: 'Desactivar' }));
    await waitFor(() => {
      expect(document.body.textContent).toContain('¿Desactivar Mesa 3?');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sí, desactivar' }));
    expect(
      await screen.findByText(
        'La mesa tiene un pedido abierto; ciérralo o muévelo antes de desactivarla.',
      ),
    ).toBeVisible();
    expect(within(row).queryByText('Desactivada')).not.toBeInTheDocument();
    expect(within(row).getByText('Ocupada')).toBeVisible();
    expect(within(row).getByRole('button', { name: 'Desactivar' })).toBeInTheDocument();
  });

  it('AC-10: Activar en una fila desactivada envía PATCH { isActive: true } sin confirmación y vuelve a Libre', async () => {
    let tables = structuredClone(TABLES);
    const calls: unknown[] = [];
    server.use(
      http.get('*/api/tables', () => HttpResponse.json({ tables })),
      http.patch('*/api/tables/5', async ({ request }) => {
        const body = await request.json();
        calls.push(body);
        tables = tables.map((table) =>
          table.id === 5 ? { ...table, ...(body as object) } : table,
        );
        return HttpResponse.json(tables.find((table) => table.id === 5));
      }),
    );
    show(<MesasPage />);
    await screen.findByText('Mesa 10');
    const row = tableRow('Mesa 10');
    fireEvent.click(within(row).getByRole('button', { name: 'Activar' }));
    await waitFor(() => {
      expect(calls).toEqual([{ isActive: true }]);
    });
    // Activar no pide confirmación.
    expect(screen.queryByRole('button', { name: 'Sí, activar' })).not.toBeInTheDocument();
    const updated = tableRow('Mesa 10');
    expect(await within(updated).findByText('Libre')).toBeVisible();
    expect(within(updated).queryByText('Desactivada')).not.toBeInTheDocument();
  });
});
