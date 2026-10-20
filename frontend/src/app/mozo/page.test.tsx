// AC-05 a AC-08. Spec 011 — el tablero del mozo reemplaza el placeholder de la
// 003 en frontend/src/app/mozo/page.tsx: hoy ese módulo solo pinta 'Mozo', así
// que todos estos tests están EN ROJO por ausencia (h1 'Mesas', tarjetas,
// estados y polling de D-011-03 no existen todavía).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { HttpResponse, delay, http } from 'msw';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../tests/msw-server.ts';
import { hardNavigate } from '../../lib/navigation.ts';
import MozoPage from './page.tsx';

const mocks = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
  usePathname: () => window.location.pathname,
}));
vi.mock('next/link', () => ({
  default: ({ href, ...props }: ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...props} />
  ),
}));
vi.mock('../../lib/navigation.ts', () => ({ hardNavigate: vi.fn() }));

// Cuerpos JSON que pasan por HttpResponse.json (MSW exige JsonBodyType).
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const SESSION_WAITER = {
  user: { id: 7, username: 'mozo.juan', displayName: 'Juan', roles: ['waiter'] },
  expiresAt: '2026-10-20T07:00:00.000Z',
};
const SESSION_ADMIN = {
  user: { id: 1, username: 'dueno', displayName: 'Carlos', roles: ['admin'] },
  expiresAt: '2026-10-20T07:00:00.000Z',
};
const JUAN = { id: 7, displayName: 'Juan' };
const errorBody = (code: string) => ({ error: { code, message: 'Mensaje.', details: null } });

function makeOrder(overrides: Record<string, JsonValue> = {}) {
  return {
    id: 41,
    status: 'open',
    tables: [{ id: 3, name: 'Mesa 3' }],
    openedBy: JUAN,
    openedAt: '2026-10-11T15:00:00.000Z',
    readyAt: null,
    billRequestedAt: null,
    closedAt: null,
    closedBy: null,
    cancelReason: null,
    mergedIntoOrderId: null,
    items: [],
    totalCents: 4500,
    ...overrides,
  };
}

const MESA1 = { id: 1, name: 'Mesa 1', isActive: true, state: 'free', order: null };
const MESA2 = { id: 2, name: 'Mesa 2', isActive: true, state: 'free', order: null };
const MESA3_OCUPADA = {
  id: 3,
  name: 'Mesa 3',
  isActive: true,
  state: 'occupied',
  order: makeOrder(),
};
const MESA9_INACTIVA = { id: 9, name: 'Mesa 9', isActive: false, state: 'free', order: null };

function show(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return Object.assign(render(<QueryClientProvider client={client}>{node}</QueryClientProvider>), {
    queryClient: client,
  });
}
function mockSession(session: JsonValue = SESSION_WAITER) {
  server.use(http.get('*/api/auth/me', () => HttpResponse.json(session)));
}
function mockTables(tables: JsonValue[]) {
  server.use(http.get('*/api/tables', () => HttpResponse.json({ tables })));
}
async function renderTablero(tables: JsonValue[]) {
  mockTables(tables);
  show(<MozoPage />);
  await screen.findByRole('heading', { name: 'Mesas', level: 1 });
}

describe('011: el tablero del salón (/mozo)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/mozo');
    mockSession();
    mockTables([MESA1, MESA2, MESA3_OCUPADA, MESA9_INACTIVA]);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('AC-05: una tarjeta por mesa activa con nombre y etiqueta; las inactivas no aparecen', async () => {
    mockTables([MESA1, MESA3_OCUPADA, MESA9_INACTIVA]);
    show(<MozoPage />);
    await screen.findByRole('heading', { name: 'Mesas', level: 1 });
    const cardLibre = await screen.findByRole('link', { name: /Mesa 1/ });
    expect(within(cardLibre).getByText('Libre')).toBeVisible();
    const cardOcupada = screen.getByRole('link', { name: /Mesa 3/ });
    expect(within(cardOcupada).getByText('Ocupada')).toBeVisible();
    expect(cardOcupada).toHaveTextContent(/Juan/);
    expect(cardOcupada).toHaveTextContent(/S\/ 45\.00/);
    expect(screen.getByText('2 mesas activas')).toBeVisible();
    expect(screen.queryByRole('link', { name: /Mesa 9/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Mesa 9')).not.toBeInTheDocument();
  });

  it('AC-05: mesas unidas, ambas marcas con listo+cuenta y Anulación pedida en la tarjeta', async () => {
    const mesaUnida = {
      ...MESA3_OCUPADA,
      state: 'ready',
      order: makeOrder({
        tables: [
          { id: 3, name: 'Mesa 3' },
          { id: 4, name: 'Mesa 4' },
        ],
        readyAt: '2026-10-11T15:30:00.000Z',
        billRequestedAt: '2026-10-11T15:35:00.000Z',
        items: [{ status: 'void_requested' }],
      }),
    };
    const mesaCuenta = {
      id: 5,
      name: 'Mesa 5',
      isActive: true,
      state: 'bill_requested',
      order: makeOrder({ id: 42, billRequestedAt: '2026-10-11T15:40:00.000Z' }),
    };
    mockTables([mesaUnida, mesaCuenta]);
    show(<MozoPage />);
    const card = await screen.findByRole('link', { name: /Mesa 3/ });
    // Etiqueta derivada con precedencia: 'Pedido listo'…
    expect(within(card).getByText('Pedido listo')).toBeVisible();
    // …pero las dos marcas se ven a la vez.
    expect(within(card).getByText(/Pidió la cuenta/)).toBeVisible();
    expect(within(card).getByText('y Mesa 4')).toBeVisible();
    expect(within(card).getByText('Anulación pedida')).toBeVisible();
    const cardCuenta = screen.getByRole('link', { name: /Mesa 5/ });
    expect(within(cardCuenta).getByText('Pidió la cuenta')).toBeVisible();
  });

  it('AC-06: Cargando mesas..., No se pudo cargar el salón. con Reintentar y No hay mesas activas.', async () => {
    server.use(
      http.get('*/api/tables', async () => {
        await delay('infinite');
        return HttpResponse.json({ tables: [] });
      }),
    );
    const pending = show(<MozoPage />);
    expect(await screen.findByRole('status')).toHaveTextContent('Cargando mesas...');
    pending.unmount();
    server.use(
      http.get('*/api/tables', () =>
        HttpResponse.json(errorBody('INTERNAL_ERROR'), { status: 500 }),
      ),
    );
    show(<MozoPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el salón.');
    mockTables([]);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('No hay mesas activas.')).toBeVisible();
  });

  it('AC-06: un ApiError UNAUTHENTICATED lleva a /login', async () => {
    server.use(
      http.get('*/api/tables', () =>
        HttpResponse.json(errorBody('UNAUTHENTICATED'), { status: 401 }),
      ),
    );
    show(<MozoPage />);
    await waitFor(() => {
      expect(hardNavigate).toHaveBeenCalledWith('/login');
    });
  });

  it('AC-07: al intervalo de polling reconsulta GET /tables y una mesa ocupada aparece sola', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let requests = 0;
    let mesa3: JsonValue = { ...MESA3_OCUPADA, state: 'free', order: null };
    server.use(
      http.get('*/api/tables', () => {
        requests += 1;
        return HttpResponse.json({ tables: [MESA1, mesa3] });
      }),
    );
    show(<MozoPage />);
    await screen.findByRole('link', { name: /Mesa 3/ });
    await waitFor(() => {
      expect(requests).toBe(1);
    });
    mesa3 = { ...MESA3_OCUPADA };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await waitFor(() => {
      expect(requests).toBe(2);
    });
    const card = await screen.findByRole('link', { name: /Mesa 3/ });
    expect(within(card).getByText('Ocupada')).toBeVisible();
    vi.useRealTimers();
  });

  it('AC-08: cada tarjeta enlaza a /mozo/mesas/<id>; el cajero va a /caja y el admin entra', async () => {
    await renderTablero([MESA1, MESA3_OCUPADA]);
    expect(screen.getByRole('link', { name: /Mesa 1/ })).toHaveAttribute('href', '/mozo/mesas/1');
    expect(screen.getByRole('link', { name: /Mesa 3/ })).toHaveAttribute('href', '/mozo/mesas/3');
    // Cajero: RoleGuard lo lleva a su área.
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({
          user: { id: 4, username: 'caja.ana', displayName: 'Ana', roles: ['cashier'] },
          expiresAt: '2026-10-20T07:00:00.000Z',
        }),
      ),
    );
    show(<MozoPage />);
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/caja');
    });
    // Admin: entra al área del salón.
    mockSession(SESSION_ADMIN);
    show(<MozoPage />);
    expect(await screen.findAllByRole('heading', { name: 'Mesas', level: 1 })).not.toHaveLength(0);
  });

  it('AC-O01: el click normal abre acciones sin navegar ni abrir pedido; Cancelar/Escape no envían POST', async () => {
    let posts = 0;
    server.use(
      http.post('*/api/tables/1/orders', () => {
        posts += 1;
        return HttpResponse.json(makeOrder({ tables: [{ id: 1, name: 'Mesa 1' }] }), {
          status: 201,
        });
      }),
    );
    await renderTablero([MESA1]);

    const mesa = screen.getByRole('link', { name: /Mesa 1/ });
    expect(mesa).toHaveAttribute('href', '/mozo/mesas/1');
    mesa.focus();
    const plainClick = createEvent.click(mesa, { button: 0 });
    fireEvent(mesa, plainClick);
    const dialog = await screen.findByRole('dialog', { name: 'Acciones de Mesa 1' });
    expect(plainClick.defaultPrevented).toBe(true);
    expect(window.location.pathname).toBe('/mozo');
    expect(mocks.push).not.toHaveBeenCalled();
    expect(posts).toBe(0);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.activeElement).toBe(mesa);
    expect(posts).toBe(0);

    fireEvent.click(mesa);
    const reopened = await screen.findByRole('dialog', { name: 'Acciones de Mesa 1' });
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.activeElement).toBe(mesa);
    expect(posts).toBe(0);
    expect(within(reopened).queryByRole('button', { name: 'Abrir mesa' })).not.toBeInTheDocument();
  });

  it('AC-O02: confirmar apertura hace un POST ante doble toque y navega directo al catálogo en 201', async () => {
    const posts: string[] = [];
    server.use(
      http.post('*/api/tables/1/orders', async ({ request }) => {
        posts.push(await request.text());
        await delay(80);
        return HttpResponse.json(makeOrder({ tables: [{ id: 1, name: 'Mesa 1' }] }), {
          status: 201,
        });
      }),
    );
    await renderTablero([MESA1]);
    fireEvent.click(screen.getByRole('link', { name: /Mesa 1/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Acciones de Mesa 1' });
    const open = within(dialog).getByRole('button', { name: 'Abrir mesa' });

    fireEvent.click(open);
    fireEvent.click(open);

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith('/mozo/mesas/1/agregar');
    });
    expect(posts).toEqual(['']);
    expect(mocks.push.mock.calls).toEqual([['/mozo/mesas/1/agregar']]);
  });

  it.each(['500', 'respuesta inválida'])(
    'AC-O02: apertura con %s no navega y deja un error visible para reintentar',
    async (failure) => {
      server.use(
        http.post('*/api/tables/1/orders', () =>
          failure === '500'
            ? HttpResponse.json(errorBody('INTERNAL_ERROR'), { status: 500 })
            : HttpResponse.json({ invalid: true }, { status: 201 }),
        ),
      );
      await renderTablero([MESA1]);
      fireEvent.click(screen.getByRole('link', { name: /Mesa 1/ }));
      const dialog = await screen.findByRole('dialog', { name: 'Acciones de Mesa 1' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Abrir mesa' }));

      expect(await within(dialog).findByRole('alert')).toBeVisible();
      expect(mocks.push).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog', { name: 'Acciones de Mesa 1' })).toBeVisible();
    },
  );

  it('AC-O02: un 409 relee mesa ocupada y ofrece acciones reales sin navegar ni reabrirla', async () => {
    let currentTable: JsonValue = MESA1;
    let posts = 0;
    server.use(
      http.get('*/api/tables', () => HttpResponse.json({ tables: [currentTable] })),
      http.post('*/api/tables/1/orders', () => {
        posts += 1;
        currentTable = {
          ...MESA3_OCUPADA,
          id: 1,
          name: 'Mesa 1',
          order: makeOrder({ tables: [{ id: 1, name: 'Mesa 1' }] }),
        };
        return HttpResponse.json(errorBody('TABLE_OCCUPIED'), { status: 409 });
      }),
    );
    show(<MozoPage />);
    await screen.findByRole('heading', { name: 'Mesas', level: 1 });
    fireEvent.click(screen.getByRole('link', { name: /Mesa 1/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Acciones de Mesa 1' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Abrir mesa' }));

    await screen.findByRole('link', { name: 'Agregar productos' });
    const occupiedActions = screen.getByRole('dialog', { name: 'Acciones de Mesa 1' });
    expect(
      within(occupiedActions).getByRole('link', { name: 'Agregar productos' }),
    ).toHaveAttribute('href', '/mozo/mesas/1/agregar');
    expect(within(occupiedActions).getByRole('link', { name: 'Ver pedido' })).toHaveAttribute(
      'href',
      '/mozo/mesas/1',
    );
    expect(
      within(occupiedActions).queryByRole('button', { name: 'Abrir mesa' }),
    ).not.toBeInTheDocument();
    expect(posts).toBe(1);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('AC-O02: el polling sustituye acciones al ocuparse y cierra la selección si se desactiva', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let currentTable: JsonValue = MESA1;
    let requests = 0;
    let posts = 0;
    server.use(
      http.get('*/api/tables', () => {
        requests += 1;
        return HttpResponse.json({ tables: [currentTable] });
      }),
      http.post('*/api/tables/1/orders', () => {
        posts += 1;
        return HttpResponse.json(makeOrder({ tables: [{ id: 1, name: 'Mesa 1' }] }), {
          status: 201,
        });
      }),
    );
    show(<MozoPage />);
    await screen.findByRole('heading', { name: 'Mesas', level: 1 });
    await waitFor(() => expect(requests).toBe(1));
    fireEvent.click(screen.getByRole('link', { name: /Mesa 1/ }));
    expect(await screen.findByRole('dialog', { name: 'Acciones de Mesa 1' })).toBeVisible();

    currentTable = {
      ...MESA1,
      state: 'occupied',
      order: makeOrder({ tables: [{ id: 1, name: 'Mesa 1' }] }),
    };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    const occupiedDialog = await screen.findByRole('dialog', { name: 'Acciones de Mesa 1' });
    expect(within(occupiedDialog).getByRole('link', { name: 'Agregar productos' })).toHaveAttribute(
      'href',
      '/mozo/mesas/1/agregar',
    );
    expect(
      within(occupiedDialog).queryByRole('button', { name: 'Abrir mesa' }),
    ).not.toBeInTheDocument();

    currentTable = { ...MESA1, isActive: false };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Acciones de Mesa 1' })).not.toBeInTheDocument();
    });
    expect(posts).toBe(0);

    const requestsBeforeReactivation = requests;
    currentTable = MESA1;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await waitFor(() => expect(requests).toBeGreaterThan(requestsBeforeReactivation));
    expect(screen.queryByRole('dialog', { name: 'Acciones de Mesa 1' })).not.toBeInTheDocument();
    expect(posts).toBe(0);
  });

  it('AC-O03: mesa ocupada mantiene hrefs reales para agregar productos y ver pedido', async () => {
    await renderTablero([MESA3_OCUPADA]);
    const mesa = screen.getByRole('link', { name: /Mesa 3/ });
    expect(mesa).toHaveAttribute('href', '/mozo/mesas/3');
    fireEvent.click(mesa);
    const dialog = await screen.findByRole('dialog', { name: 'Acciones de Mesa 3' });
    expect(within(dialog).getByRole('link', { name: 'Agregar productos' })).toHaveAttribute(
      'href',
      '/mozo/mesas/3/agregar',
    );
    expect(within(dialog).getByRole('link', { name: 'Ver pedido' })).toHaveAttribute(
      'href',
      '/mozo/mesas/3',
    );
    expect(within(dialog).queryByRole('button', { name: 'Abrir mesa' })).not.toBeInTheDocument();
  });
});
