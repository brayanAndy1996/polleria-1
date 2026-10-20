// AC-09 a AC-14, AC-20 y AC-21. Spec 011 — archivo nuevo: va EN ROJO hasta que
// T-11 y T-13 creen frontend/src/app/mozo/mesas/[tableId]/page.tsx (hoy no existe:
// el rojo es por ausencia del módulo). La página resuelve la mesa del listado
// (D-011-05), consulta el detalle con polling y ofrece las acciones del ciclo.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, delay, http } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../../../tests/msw-server.ts';
import MesaPage from './page.tsx';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  params: { tableId: '3' },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
  usePathname: () => window.location.pathname,
  useParams: () => mocks.params,
}));
vi.mock('../../../../lib/navigation.ts', () => ({ hardNavigate: vi.fn() }));

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
const ADMIN = { id: 1, displayName: 'Carlos' };
const errorBody = (code: string, message = 'Mensaje.', details: JsonValue = null) => ({
  error: { code, message, details },
});

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
    totalCents: 0,
    ...overrides,
  };
}
function makeItem(overrides: Record<string, JsonValue> = {}) {
  return {
    id: 11,
    productId: 1,
    productName: 'Pollo a la brasa',
    productCategory: 'chicken',
    quantity: 2,
    priceCents: 1400,
    portion: 'quarter',
    cut: 'leg',
    breastEighths: 0,
    legEighths: 4,
    notes: null,
    sauces: [],
    components: [],
    status: 'sent',
    kitchenTicketId: 5,
    voidTicketId: null,
    voidedBy: null,
    voidedAt: null,
    voidReason: null,
    voidRequestedBy: null,
    voidRequestedAt: null,
    voidRequestReason: null,
    orderedAtTable: { id: 3, name: 'Mesa 3' },
    createdBy: JUAN,
    createdAt: '2026-10-11T15:05:00.000Z',
    ...overrides,
  };
}
function makeTicket(overrides: Record<string, JsonValue> = {}) {
  return {
    id: 5,
    orderId: 41,
    kind: 'initial',
    items: [ITEM_POLLO],
    createdBy: JUAN,
    createdAt: '2026-10-11T15:05:00.000Z',
    ...overrides,
  };
}

const ITEM_POLLO = makeItem();
const ITEM_AJI_SOLTO = makeItem({
  id: 12,
  productId: 6,
  productName: 'Ají',
  productCategory: 'sauce',
  quantity: 1,
  priceCents: 0,
  portion: null,
  cut: null,
  orderedAtTable: { id: 4, name: 'Mesa 4' },
});
const ITEM_GASEOSA_ANULADA = makeItem({
  id: 13,
  productId: 4,
  productName: 'Inca Kola',
  productCategory: 'drink',
  quantity: 1,
  priceCents: 400,
  portion: null,
  cut: null,
  status: 'voided',
  voidTicketId: 7,
  voidedBy: ADMIN,
  voidedAt: '2026-10-11T15:30:00.000Z',
  voidReason: 'Error de cocina',
});
const ITEM_CHAUFA_PEDIDA = makeItem({
  id: 14,
  productId: 3,
  productName: 'Chaufa',
  productCategory: 'dish',
  quantity: 1,
  priceCents: 1400,
  portion: null,
  cut: null,
  status: 'void_requested',
  voidRequestedBy: JUAN,
  voidRequestedAt: '2026-10-11T15:20:00.000Z',
  voidRequestReason: 'El cliente se equivocó',
});
const ORDER_VACIO = makeOrder();
const ORDER_CON_ITEMS = makeOrder({
  items: [ITEM_POLLO, ITEM_AJI_SOLTO, ITEM_GASEOSA_ANULADA, ITEM_CHAUFA_PEDIDA],
  totalCents: 6200,
});

const MESA1 = { id: 1, name: 'Mesa 1', isActive: true, state: 'free', order: null };
const MESA2 = { id: 2, name: 'Mesa 2', isActive: true, state: 'free', order: null };
const MESA3_LIBRE = { id: 3, name: 'Mesa 3', isActive: true, state: 'free', order: null };
const MESA3_OCUPADA = {
  id: 3,
  name: 'Mesa 3',
  isActive: true,
  state: 'occupied',
  order: ORDER_VACIO,
};
const MESA5_OCUPADA = {
  id: 5,
  name: 'Mesa 5',
  isActive: true,
  state: 'occupied',
  order: makeOrder({ id: 42, tables: [{ id: 5, name: 'Mesa 5' }] }),
};
const MESA9_INACTIVA = { id: 9, name: 'Mesa 9', isActive: false, state: 'free', order: null };
const SALON = [MESA1, MESA2, MESA3_OCUPADA, MESA5_OCUPADA, MESA9_INACTIVA];

function show(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
function mockSession(session: JsonValue = SESSION_WAITER) {
  server.use(http.get('*/api/auth/me', () => HttpResponse.json(session)));
}
function mockSalon(tables: JsonValue[] = SALON) {
  server.use(http.get('*/api/tables', () => HttpResponse.json({ tables })));
}
function mockOrder(order: JsonValue = ORDER_VACIO) {
  server.use(http.get('*/api/orders/41', () => HttpResponse.json(order)));
}
function mockTickets(tickets: JsonValue[] = []) {
  server.use(http.get('*/api/orders/41/tickets', () => HttpResponse.json({ tickets })));
}
/** La mesa ocupada del salon con su pedido y comandas listos para la vista. */
async function renderMesaOcupada(order: JsonValue = ORDER_VACIO, tickets: JsonValue[] = []) {
  mockOrder(order);
  mockTickets(tickets);
  const view = show(<MesaPage />);
  expect(await screen.findByRole('heading', { name: 'Mesa 3', level: 1 })).toBeVisible();
  expect(await screen.findByRole('heading', { name: 'Pedido', level: 2 })).toBeVisible();
  return view;
}
function expectNavigatedTo(path: string) {
  const calls = [...mocks.push.mock.calls, ...mocks.replace.mock.calls].map(
    (call: unknown[]) => call[0],
  );
  expect(calls).toContain(path);
}

/** Fila de ítem del pedido: el <li>/listitem que contiene ese texto. */
function itemRow(name: RegExp | string) {
  const row = screen.getByText(name).closest('li, [role="listitem"]');
  if (!row) throw new Error(`fila de ítem no encontrada: ${name}`);
  return row as HTMLElement;
}

describe('011: la mesa y su pedido (/mozo/mesas/[tableId])', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/mozo/mesas/3');
    mocks.params.tableId = '3';
    mockSession();
    mockSalon();
    mockOrder();
    mockTickets();
  });

  it('AC-09: mesa libre muestra nombre, Libre y Abrir mesa; un doble toque hace un solo POST', async () => {
    let mesa3: JsonValue = { ...MESA3_LIBRE };
    const posts: unknown[] = [];
    server.use(
      http.get('*/api/tables', () => HttpResponse.json({ tables: [MESA1, mesa3, MESA5_OCUPADA] })),
      http.post('*/api/tables/3/orders', async ({ request }) => {
        posts.push(await request.text());
        mesa3 = { ...MESA3_OCUPADA };
        return HttpResponse.json(ORDER_VACIO, { status: 201 });
      }),
    );
    show(<MesaPage />);
    expect(await screen.findByRole('heading', { name: 'Mesa 3', level: 1 })).toBeVisible();
    expect(screen.getByText('Libre')).toBeVisible();
    const open = screen.getByRole('button', { name: 'Abrir mesa' });
    fireEvent.click(open);
    fireEvent.click(open);
    // Tras el 201 la vista muestra el pedido abierto con su estado vacío.
    expect(await screen.findByText('Todavía no hay ítems enviados.')).toBeVisible();
    expect(posts).toEqual(['']);
  });

  it('AC-09: con 409 TABLE_OCCUPIED se muestra su mensaje y la mesa reaparece ocupada', async () => {
    let mesa3: JsonValue = { ...MESA3_LIBRE };
    server.use(
      http.get('*/api/tables', () => HttpResponse.json({ tables: [MESA1, mesa3] })),
      http.post('*/api/tables/3/orders', () => {
        mesa3 = { ...MESA3_OCUPADA };
        return HttpResponse.json(
          errorBody('TABLE_OCCUPIED', 'La mesa ya tiene un pedido abierto.'),
          {
            status: 409,
          },
        );
      }),
    );
    show(<MesaPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir mesa' }));
    await waitFor(() => {
      expect(screen.getByText('La mesa ya tiene un pedido abierto.')).toBeVisible();
      expect(screen.getByText('Ocupada')).toBeVisible();
    });
  });

  it('AC-09: un id que no está en la lista muestra "Esa mesa no existe." con enlace al tablero', async () => {
    mocks.params.tableId = '99';
    show(<MesaPage />);
    expect(await screen.findByText('Esa mesa no existe.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Volver a las mesas' })).toHaveAttribute(
      'href',
      '/mozo',
    );
  });

  it('AC-10: la sección Pedido lista ítems con etiquetas, estados, "· Mesa 4" y el total', async () => {
    await renderMesaOcupada(ORDER_CON_ITEMS);
    expect(screen.getByRole('heading', { name: 'Pedido', level: 2 })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Agregar ítems' })).toHaveAttribute(
      'href',
      '/mozo/mesas/3/agregar',
    );
    // Línea del pollo: cantidad, nombre y etiqueta de presentación-parte de la 008.
    expect(screen.getByText(/2 × Pollo a la brasa — Cuarto — pierna/)).toBeVisible();
    expect(screen.getByText('Total S/ 62.00')).toBeVisible();
    // El ítem de la otra mesa unida lleva su traza '· Mesa 4'.
    const aji = itemRow('Ají');
    expect(within(aji).getByText(/· Mesa 4/)).toBeVisible();
    // 'sent' sin marca: el pollo no lleva etiqueta de estado.
    const polloRow = itemRow(/2 × Pollo a la brasa/);
    expect(within(polloRow).queryByText('Anulado')).not.toBeInTheDocument();
    expect(within(polloRow).queryByText('Anulación pedida')).not.toBeInTheDocument();
    // 'void_requested': marca + quién la pidió + motivo.
    const chaufaRow = itemRow('Chaufa');
    expect(within(chaufaRow).getByText('Anulación pedida')).toBeVisible();
    expect(within(chaufaRow).getByText(/pidió Juan/)).toBeVisible();
    expect(within(chaufaRow).getByText(/El cliente se equivocó/)).toBeVisible();
    // 'voided': 'Anulado' tachado con motivo final y aprobador.
    const incaRow = itemRow('Inca Kola');
    expect(within(incaRow).getByText('Anulado')).toBeVisible();
    expect(within(incaRow).getByText(/Error de cocina/)).toBeVisible();
    expect(within(incaRow).getByText(/Carlos/)).toBeVisible();
    expect(screen.getByText('Inca Kola').className).toMatch(/line-through/);
  });

  it('AC-10: las líneas muestran cremas con precio, observación y componentes sangrados', async () => {
    const order = makeOrder({
      items: [
        makeItem({
          notes: 'sin ensalada',
          sauces: [{ productId: 6, productName: 'Ocopa', quantity: 2, priceCents: 300 }],
        }),
        makeItem({
          id: 15,
          productId: 2,
          productName: 'Mostrito',
          productCategory: 'combo',
          quantity: 1,
          priceCents: 2200,
          portion: null,
          cut: null,
          components: [
            {
              productId: 1,
              productName: 'Pollo a la brasa',
              quantity: 1,
              portion: 'quarter',
              cut: 'leg',
              breastEighths: 0,
              legEighths: 2,
            },
            {
              productId: 3,
              productName: 'Chaufa',
              quantity: 1,
              portion: null,
              cut: null,
              breastEighths: 0,
              legEighths: 0,
            },
          ],
        }),
      ],
      totalCents: 5000,
    });
    await renderMesaOcupada(order);
    expect(screen.getByText(/\+ Ocopa × 2 · S\/ 6\.00/)).toBeVisible();
    expect(screen.getByText(/sin ensalada/)).toBeVisible();
    const mostritoRow = itemRow('Mostrito');
    expect(within(mostritoRow).getByText(/Pollo a la brasa.*Cuarto — pierna/)).toBeVisible();
    expect(within(mostritoRow).getByText(/Chaufa/)).toBeVisible();
    expect(screen.getByText('Total S/ 50.00')).toBeVisible();
  });

  it('AC-10: "Cargando pedido...", "No se pudo cargar el pedido." con Reintentar y "Ese pedido no existe."', async () => {
    server.use(
      http.get('*/api/orders/41', async () => {
        await delay('infinite');
        return HttpResponse.json(ORDER_VACIO);
      }),
    );
    const pending = show(<MesaPage />);
    expect(await screen.findByRole('heading', { name: 'Mesa 3', level: 1 })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Cargando pedido...');
    pending.unmount();
    server.use(
      http.get('*/api/orders/41', () =>
        HttpResponse.json(errorBody('INTERNAL_ERROR'), { status: 500 }),
      ),
    );
    // Segunda montada con error: alerta + Reintentar vuelve a consultar.
    show(<MesaPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el pedido.');
    server.use(http.get('*/api/orders/41', () => HttpResponse.json(ORDER_VACIO)));
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Todavía no hay ítems enviados.')).toBeVisible();
    // Un 404 ORDER_NOT_FOUND muestra su propio mensaje con el enlace al tablero.
    server.use(
      http.get('*/api/orders/41', () =>
        HttpResponse.json(errorBody('ORDER_NOT_FOUND', 'Ese pedido no existe.'), { status: 404 }),
      ),
    );
    show(<MesaPage />);
    expect(await screen.findByText('Ese pedido no existe.')).toBeVisible();
    expect(screen.getAllByRole('link', { name: 'Volver a las mesas' })[0]).toHaveAttribute(
      'href',
      '/mozo',
    );
  });

  it('AC-11: listo, servido y cuenta siguen las marcas del pedido; un 409 muestra su mensaje', async () => {
    let order = ORDER_VACIO;
    const calls: string[] = [];
    server.use(
      http.get('*/api/orders/41', () => HttpResponse.json(order)),
      http.post('*/api/orders/41/ready', () => {
        calls.push('ready');
        order = makeOrder({ readyAt: '2026-10-11T15:10:00.000Z' });
        return HttpResponse.json(order);
      }),
      http.post('*/api/orders/41/served', () => {
        calls.push('served');
        order = ORDER_VACIO;
        return HttpResponse.json(order);
      }),
      http.post('*/api/orders/41/request-bill', () => {
        calls.push('request-bill');
        order = makeOrder({ billRequestedAt: '2026-10-11T15:12:00.000Z' });
        return HttpResponse.json(order);
      }),
    );
    await renderMesaOcupada(order);
    // Sin readyAt: 'Marcar pedido listo' y 'Pedir la cuenta' visibles.
    fireEvent.click(screen.getByRole('button', { name: 'Marcar pedido listo' }));
    await waitFor(() => {
      expect(calls).toEqual(['ready']);
    });
    // Con listo vigente aparece 'Marcar servido' y la etiqueta 'Pedido listo'.
    expect(await screen.findByText('Pedido listo')).toBeVisible();
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar servido' }));
    await waitFor(() => {
      expect(calls).toEqual(['ready', 'served']);
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Pedir la cuenta' }));
    await waitFor(() => {
      expect(calls).toEqual(['ready', 'served', 'request-bill']);
    });
    // Con billRequestedAt vigente el botón ya no se ofrece y la marca se ve.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Pedir la cuenta' })).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Pidió la cuenta/)).toBeVisible();
  });

  it('AC-11: un 409 ORDER_NOT_OPEN en una señal muestra su mensaje tal cual', async () => {
    server.use(
      http.post('*/api/orders/41/ready', () =>
        HttpResponse.json(errorBody('ORDER_NOT_OPEN', 'El pedido ya no está abierto.'), {
          status: 409,
        }),
      ),
    );
    await renderMesaOcupada();
    fireEvent.click(screen.getByRole('button', { name: 'Marcar pedido listo' }));
    expect(await screen.findByText('El pedido ya no está abierto.')).toBeVisible();
  });

  it('AC-12: mover ofrece solo libres activas no cubiertas, hace POST move y navega al destino', async () => {
    const seen = vi.fn();
    server.use(
      http.post('*/api/orders/41/move', async ({ request }) => {
        seen(await request.json());
        return HttpResponse.json(makeOrder({ tables: [{ id: 2, name: 'Mesa 2' }] }));
      }),
    );
    await renderMesaOcupada();
    fireEvent.click(screen.getByRole('button', { name: 'Mover a otra mesa' }));
    const select = await screen.findByRole('combobox');
    const options = within(select)
      .getAllByRole('option')
      .map((option) => option.textContent);
    // Libres activas: Mesa 1 y Mesa 2. Ni Mesa 3 (la actual), ni Mesa 5 (ocupada), ni Mesa 9 (inactiva).
    expect(options).toEqual(expect.arrayContaining(['Mesa 1', 'Mesa 2']));
    expect(options).not.toContain('Mesa 3');
    expect(options).not.toContain('Mesa 5');
    expect(options).not.toContain('Mesa 9');
    fireEvent.change(select, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /^(mover|sí, mover)$/i }));
    await waitFor(() => {
      expect(seen).toHaveBeenCalledExactlyOnceWith({ tableId: 2 });
    });
    await waitFor(() => {
      expectNavigatedTo('/mozo/mesas/2');
    });
  });

  it('AC-12: unir ofrece solo ocupadas activas, hace POST join de la origen a la actual', async () => {
    const seen = vi.fn();
    const orderUnido = makeOrder({
      tables: [
        { id: 3, name: 'Mesa 3' },
        { id: 5, name: 'Mesa 5' },
      ],
    });
    server.use(
      http.get('*/api/orders/41', () => HttpResponse.json(orderUnido)),
      http.post('*/api/tables/5/join', async ({ request }) => {
        seen(await request.json());
        return HttpResponse.json(orderUnido);
      }),
    );
    await renderMesaOcupada(orderUnido);
    fireEvent.click(screen.getByRole('button', { name: 'Unir mesa' }));
    const select = await screen.findByRole('combobox');
    const options = within(select)
      .getAllByRole('option')
      .map((option) => option.textContent);
    // Solo ocupadas activas: Mesa 5. Ni libres (Mesa 1, Mesa 2) ni inactivas (Mesa 9).
    expect(options).toContain('Mesa 5');
    expect(options).not.toContain('Mesa 1');
    expect(options).not.toContain('Mesa 2');
    expect(options).not.toContain('Mesa 9');
    fireEvent.change(select, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /^(unir|sí, unir)$/i }));
    await waitFor(() => {
      expect(seen).toHaveBeenCalledExactlyOnceWith({ intoTableId: 3 });
    });
    expect(await screen.findByText(/y Mesa 5/)).toBeVisible();
  });

  it('AC-12: separar confirma y hace POST leave solo para las cubiertas que no son la de la URL', async () => {
    const calls: string[] = [];
    const orderUnido = makeOrder({
      tables: [
        { id: 3, name: 'Mesa 3' },
        { id: 4, name: 'Mesa 4' },
      ],
    });
    server.use(
      http.post('*/api/tables/4/leave', () => {
        calls.push('leave4');
        return HttpResponse.json(makeOrder());
      }),
    );
    await renderMesaOcupada(orderUnido);
    expect(screen.getByRole('button', { name: 'Separar Mesa 4' })).toBeVisible();
    // La mesa de la URL nunca se ofrece para separar.
    expect(screen.queryByRole('button', { name: 'Separar Mesa 3' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Separar Mesa 4' }));
    expect(await screen.findByText('¿Separar Mesa 4? Quedará libre.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, separar' }));
    await waitFor(() => {
      expect(calls).toEqual(['leave4']);
    });
  });

  it('AC-12: un 409 del salón (ORDER_NEEDS_TABLE) muestra su mensaje', async () => {
    server.use(
      http.post('*/api/tables/4/leave', () =>
        HttpResponse.json(
          errorBody(
            'ORDER_NEEDS_TABLE',
            'El pedido necesita al menos una mesa; cancélalo o ciérralo.',
          ),
          { status: 409 },
        ),
      ),
    );
    await renderMesaOcupada(
      makeOrder({
        tables: [
          { id: 3, name: 'Mesa 3' },
          { id: 4, name: 'Mesa 4' },
        ],
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Separar Mesa 4' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, separar' }));
    expect(
      await screen.findByText('El pedido necesita al menos una mesa; cancélalo o ciérralo.'),
    ).toBeVisible();
  });

  it('AC-13: cancelar pide el motivo, hace POST cancel y vuelve al tablero', async () => {
    const seen = vi.fn();
    server.use(
      http.post('*/api/orders/41/cancel', async ({ request }) => {
        seen(await request.json());
        return HttpResponse.json({ ...ORDER_VACIO, status: 'cancelled' });
      }),
    );
    await renderMesaOcupada();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar pedido' }));
    const reason = await screen.findByLabelText('Motivo de la cancelación');
    fireEvent.change(reason, { target: { value: 'Se fueron sin pedir' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
    await waitFor(() => {
      expect(seen).toHaveBeenCalledExactlyOnceWith({ reason: 'Se fueron sin pedir' });
    });
    await waitFor(() => {
      expectNavigatedTo('/mozo');
    });
  });

  it('AC-13: el 409 ORDER_HAS_ACTIVE_ITEMS muestra su mensaje y el motivo vacío se corta en local', async () => {
    const calls = vi.fn();
    server.use(
      http.post('*/api/orders/41/cancel', async ({ request }) => {
        calls(await request.json());
        return HttpResponse.json(
          errorBody(
            'ORDER_HAS_ACTIVE_ITEMS',
            'El pedido tiene ítems sin anular; un administrador debe anularlos primero.',
          ),
          { status: 409 },
        );
      }),
    );
    await renderMesaOcupada(ORDER_CON_ITEMS);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar pedido' }));
    const reason = await screen.findByLabelText('Motivo de la cancelación');
    // Motivo vacío: la validación local no deja salir el POST.
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
    await waitFor(() => {
      expect(screen.getByText(/motivo/i)).toBeInTheDocument();
    });
    expect(calls).not.toHaveBeenCalled();
    fireEvent.change(reason, { target: { value: 'Se fueron' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
    await waitFor(() => {
      expect(calls).toHaveBeenCalledExactlyOnceWith({ reason: 'Se fueron' });
    });
    expect(
      await screen.findByText(
        'El pedido tiene ítems sin anular; un administrador debe anularlos primero.',
      ),
    ).toBeVisible();
  });

  it('AC-14: Comandas enviadas lista etiquetas e ítems; Anulación solo para admin', async () => {
    const tickets = [
      makeTicket(),
      makeTicket({ id: 6, kind: 'additional', items: [ITEM_AJI_SOLTO] }),
      makeTicket({ id: 7, kind: 'void', items: [ITEM_GASEOSA_ANULADA], createdBy: ADMIN }),
    ];
    const waiter = await renderMesaOcupada(ORDER_CON_ITEMS, tickets);
    expect(screen.getByRole('heading', { name: 'Comandas enviadas', level: 2 })).toBeVisible();
    expect(screen.getByText('Comanda inicial')).toBeVisible();
    expect(screen.getByText('Adición')).toBeVisible();
    // Cada comanda lleva su hora y sus ítems.
    expect(screen.getAllByText(/\d{1,2}:\d{2}/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/Pollo a la brasa/).length).toBeGreaterThanOrEqual(2);
    // El mozo NO ve la comanda 'Anulación'.
    expect(screen.queryByText('Anulación')).not.toBeInTheDocument();
    waiter.unmount();
    // El admin sí la ve.
    mockSession(SESSION_ADMIN);
    const admin = show(<MesaPage />);
    await screen.findByRole('heading', { name: 'Mesa 3', level: 1 });
    expect(await screen.findAllByText('Anulación')).not.toHaveLength(0);
    admin.unmount();
    // Sin envíos: el estado vacío.
    server.use(http.get('*/api/orders/41/tickets', () => HttpResponse.json({ tickets: [] })));
    show(<MesaPage />);
    expect(await screen.findByText('Todavía no se envió ninguna comanda.')).toBeVisible();
  });

  it('AC-20: el mozo solicita la anulación con motivo y su clave; no ve acciones de admin', async () => {
    const seen = vi.fn();
    const seenKeys: (string | null)[] = [];
    const orderPedida = makeOrder({
      items: [ITEM_POLLO, { ...ITEM_CHAUFA_PEDIDA }],
      totalCents: 6200,
    });
    server.use(
      http.post('*/api/orders/41/items/11/request-void', async ({ request }) => {
        seen(await request.json());
        seenKeys.push(request.headers.get('Idempotency-Key'));
        return HttpResponse.json({ order: orderPedida });
      }),
      http.get('*/api/orders/41', () => HttpResponse.json(orderPedida)),
    );
    await renderMesaOcupada(makeOrder({ items: [ITEM_POLLO], totalCents: 2800 }));
    const polloRow = itemRow(/2 × Pollo a la brasa/);
    // El mozo ve 'Solicitar anulación' pero nunca las acciones del admin.
    fireEvent.click(within(polloRow).getByRole('button', { name: 'Solicitar anulación' }));
    expect(screen.queryByRole('button', { name: 'Anular' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprobar anulación' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rechazar solicitud' })).not.toBeInTheDocument();
    const reason = await screen.findByLabelText('Motivo de la anulación');
    // El motivo vacío lo corta la validación local.
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
    expect(seen).not.toHaveBeenCalled();
    fireEvent.change(reason, { target: { value: 'El cliente se equivocó' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
    await waitFor(() => {
      expect(seen).toHaveBeenCalledExactlyOnceWith({ reason: 'El cliente se equivocó' });
    });
    expect(seenKeys).toHaveLength(1);
    expect(seenKeys[0]).toMatch(/^[\x21-\x7E]{1,128}$/);
    // El ítem queda marcado con quién pidió y el motivo.
    const markedRow = itemRow(/2 × Pollo a la brasa/);
    expect(within(markedRow).getByText('Anulación pedida')).toBeVisible();
    expect(within(markedRow).getByText(/pidió Juan/)).toBeVisible();
  });

  it('AC-20: los 409 de la solicitud (VOID_REQUESTED, ALREADY_VOIDED) muestran su mensaje', async () => {
    server.use(
      http.post('*/api/orders/41/items/11/request-void', () =>
        HttpResponse.json(errorBody('ORDER_ITEM_ALREADY_VOIDED', 'El ítem ya está anulado.'), {
          status: 409,
        }),
      ),
    );
    await renderMesaOcupada(makeOrder({ items: [ITEM_POLLO], totalCents: 2800 }));
    const polloRow = itemRow(/2 × Pollo a la brasa/);
    fireEvent.click(within(polloRow).getByRole('button', { name: 'Solicitar anulación' }));
    fireEvent.change(await screen.findByLabelText('Motivo de la anulación'), {
      target: { value: 'El cliente se equivocó' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
    expect(await screen.findByText('El ítem ya está anulado.')).toBeVisible();
  });

  it('AC-21: el admin anula directo un ítem enviado y aparece la comanda Anulación', async () => {
    mockSession(SESSION_ADMIN);
    const seen = vi.fn();
    const seenKeys: (string | null)[] = [];
    const orderVoided = makeOrder({
      items: [
        {
          ...ITEM_POLLO,
          status: 'voided',
          voidTicketId: 7,
          voidedBy: ADMIN,
          voidedAt: '2026-10-11T15:40:00.000Z',
          voidReason: 'Error de cocina',
        },
      ],
      totalCents: 0,
    });
    server.use(
      http.post('*/api/orders/41/items/11/void', async ({ request }) => {
        seen(await request.json());
        seenKeys.push(request.headers.get('Idempotency-Key'));
        return HttpResponse.json({
          order: orderVoided,
          ticket: makeTicket({ id: 7, kind: 'void', createdBy: ADMIN }),
        });
      }),
      http.get('*/api/orders/41', () => HttpResponse.json(orderVoided)),
      http.get('*/api/orders/41/tickets', () =>
        HttpResponse.json({
          tickets: [makeTicket(), makeTicket({ id: 7, kind: 'void', createdBy: ADMIN })],
        }),
      ),
    );
    await renderMesaOcupada(makeOrder({ items: [ITEM_POLLO], totalCents: 2800 }), [makeTicket()]);
    const polloRow = itemRow(/2 × Pollo a la brasa/);
    fireEvent.click(within(polloRow).getByRole('button', { name: 'Anular' }));
    fireEvent.change(await screen.findByLabelText('Motivo de la anulación'), {
      target: { value: 'Error de cocina' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
    await waitFor(() => {
      expect(seen).toHaveBeenCalledExactlyOnceWith({ reason: 'Error de cocina' });
    });
    expect(seenKeys).toHaveLength(1);
    expect(seenKeys[0]).toMatch(/^[\x21-\x7E]{1,128}$/);
    const markedRow = itemRow(/2 × Pollo a la brasa/);
    expect(within(markedRow).getByText('Anulado')).toBeVisible();
    expect(await screen.findByText('Anulación')).toBeVisible();
  });

  it('AC-21: aprobar precarga el motivo del mozo editable y rechazar devuelve a Enviado', async () => {
    mockSession(SESSION_ADMIN);
    const seenVoid = vi.fn();
    const seenReject = vi.fn();
    const orderPedida = makeOrder({ items: [ITEM_CHAUFA_PEDIDA], totalCents: 1400 });
    const orderAprobada = makeOrder({
      items: [
        {
          ...ITEM_CHAUFA_PEDIDA,
          status: 'voided',
          voidedBy: ADMIN,
          voidedAt: '2026-10-11T15:50:00.000Z',
          voidReason: 'Salió mal el plato',
        },
      ],
      totalCents: 0,
    });
    server.use(
      http.post('*/api/orders/41/items/14/void', async ({ request }) => {
        seenVoid(await request.json());
        return HttpResponse.json({
          order: orderAprobada,
          ticket: makeTicket({ id: 8, kind: 'void', createdBy: ADMIN }),
        });
      }),
      http.post('*/api/orders/41/items/14/reject-void', async ({ request }) => {
        seenReject(await request.text());
        return HttpResponse.json({
          order: makeOrder({
            items: [
              {
                ...ITEM_CHAUFA_PEDIDA,
                status: 'sent',
                voidRequestedBy: null,
                voidRequestedAt: null,
                voidRequestReason: null,
              },
            ],
          }),
        });
      }),
    );
    // Aprobar: motivo del mozo precargado y editable.
    const first = await renderMesaOcupada(orderPedida);
    const chaufaRow = itemRow('Chaufa');
    fireEvent.click(within(chaufaRow).getByRole('button', { name: 'Aprobar anulación' }));
    const reason = await screen.findByLabelText<HTMLInputElement>('Motivo de la anulación');
    expect(reason.value).toBe('El cliente se equivocó');
    fireEvent.change(reason, { target: { value: 'Salió mal el plato' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
    await waitFor(() => {
      expect(seenVoid).toHaveBeenCalledExactlyOnceWith({ reason: 'Salió mal el plato' });
    });
    // Rechazar: confirma y hace POST sin cuerpo; el ítem vuelve a 'Enviado'.
    first.unmount();
    mockOrder(makeOrder({ items: [ITEM_CHAUFA_PEDIDA], totalCents: 1400 }));
    show(<MesaPage />);
    await screen.findByRole('heading', { name: 'Mesa 3', level: 1 });
    await screen.findByRole('heading', { name: 'Pedido', level: 2 });
    const row2 = itemRow('Chaufa');
    fireEvent.click(within(row2).getByRole('button', { name: 'Rechazar solicitud' }));
    expect(await screen.findByText(/¿Rechazar la anulación que pidió Juan\?/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, rechazar' }));
    await waitFor(() => {
      expect(seenReject).toHaveBeenCalledExactlyOnceWith('');
    });
  });

  it('AC-17: de vuelta de la toma la mesa muestra el aviso de generación de comanda', async () => {
    // Transporte del aviso fijado por este test (la spec no define mecanismo):
    // la toma deja sessionStorage['polleria:orderNotice'] con el texto y la mesa
    // lo muestra junto a la comanda nueva al montar.
    sessionStorage.setItem(
      'polleria:orderNotice',
      'Pedido registrado. Consulta la generación de la comanda.',
    );
    await renderMesaOcupada(ORDER_VACIO, [makeTicket()]);
    expect(
      await screen.findByText('Pedido registrado. Consulta la generación de la comanda.'),
    ).toBeVisible();
    expect(screen.getByText('Comanda inicial')).toBeVisible();
  });

  it('AC-10: el polling del detalle trae un ítem nuevo enviado desde fuera', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let order = ORDER_VACIO;
    server.use(http.get('*/api/orders/41', () => HttpResponse.json(order)));
    show(<MesaPage />);
    expect(await screen.findByText('Todavía no hay ítems enviados.')).toBeVisible();
    order = makeOrder({ items: [ITEM_POLLO], totalCents: 2800 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(await screen.findByText(/Pollo a la brasa/)).toBeVisible();
    expect(screen.getByText('Total S/ 28.00')).toBeVisible();
    vi.useRealTimers();
  });

  it('AC-04: el polling conserva la interacción abierta y el motivo que se está editando', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let order = makeOrder({ items: [ITEM_POLLO], totalCents: 2800 });
    server.use(http.get('*/api/orders/41', () => HttpResponse.json(order)));
    show(<MesaPage />);
    const row = await screen.findByText(/2 × Pollo a la brasa/).then((name) => name.closest('li'));
    expect(row).not.toBeNull();
    fireEvent.click(within(row!).getByRole('button', { name: 'Solicitar anulación' }));
    const reason = await screen.findByLabelText<HTMLInputElement>('Motivo de la anulación');
    fireEvent.change(reason, { target: { value: 'El cliente está decidiendo' } });

    order = makeOrder({ items: [ITEM_POLLO, ITEM_CHAUFA_PEDIDA], totalCents: 4200 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(screen.getByLabelText('Motivo de la anulación')).toBe(reason);
    expect(reason).toHaveValue('El cliente está decidiendo');
    expect(await screen.findByText(/Chaufa/)).toBeVisible();
    vi.useRealTimers();
  });

  it('AC-08: un cajero que entra a la pantalla va a /caja por RoleGuard', async () => {
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({
          user: { id: 4, username: 'caja.ana', displayName: 'Ana', roles: ['cashier'] },
          expiresAt: '2026-10-20T07:00:00.000Z',
        }),
      ),
    );
    show(<MesaPage />);
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/caja');
    });
    expect(screen.queryByRole('heading', { name: 'Mesa 3' })).not.toBeInTheDocument();
  });
});
