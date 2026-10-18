// AC-15 a AC-19. Spec 011 — archivo nuevo: va EN ROJO hasta que T-12/T-13 creen
// apps/web/src/app/mozo/mesas/[tableId]/agregar/page.tsx (hoy no existe: el rojo
// es por ausencia del módulo). La toma lee GET /api/menu al entrar, arma el
// carrito en local y envía la tanda con Idempotency-Key (D-011-07..D-011-10).
// El transporte del aviso nuevo queda fijado por estos tests:
// sessionStorage['polleria:orderNotice'] con el texto literal aprobado en 013.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, delay, http } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../../../../tests/msw-server.ts';
import AgregarPage from './page.tsx';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  params: { tableId: '3' },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
  useParams: () => mocks.params,
}));
vi.mock('../../../../../lib/navigation.ts', () => ({ hardNavigate: vi.fn() }));

// Cuerpos JSON que pasan por HttpResponse.json (MSW exige JsonBodyType).
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const SESSION_WAITER = {
  user: { id: 7, username: 'mozo.juan', displayName: 'Juan', roles: ['waiter'] },
  expiresAt: '2026-10-20T07:00:00.000Z',
};
const JUAN = { id: 7, displayName: 'Juan' };
const errorBody = (code: string, message = 'Mensaje.', details: JsonValue = null) => ({
  error: { code, message, details },
});

const ORDER = {
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
};
const MESA3 = { id: 3, name: 'Mesa 3', isActive: true, state: 'occupied', order: ORDER };

const POLLO = {
  id: 1,
  name: 'Pollo a la brasa',
  category: 'chicken',
  priceCents: 6500,
  portions: [
    { portion: 'eighth', cut: 'breast', priceCents: 900 },
    { portion: 'eighth', cut: 'leg', priceCents: 850 },
    { portion: 'quarter', cut: 'breast', priceCents: 1800 },
    { portion: 'quarter', cut: 'leg', priceCents: 1700 },
    { portion: 'half', cut: null, priceCents: 3300 },
    { portion: 'whole', cut: null, priceCents: 6500 },
  ],
  items: [],
};
const POLLO_FRITO = {
  id: 10,
  name: 'Pollo frito',
  category: 'chicken',
  priceCents: 4000,
  portions: [
    { portion: 'quarter', cut: 'leg', priceCents: 1500 },
    { portion: 'whole', cut: null, priceCents: 4000 },
  ],
  items: [],
};
const CHAUFA = {
  id: 3,
  name: 'Chaufa',
  category: 'dish',
  priceCents: 1400,
  portions: [],
  items: [],
};
const MOSTRITO = {
  id: 2,
  name: 'Mostrito',
  category: 'combo',
  priceCents: 2200,
  portions: [],
  items: [
    {
      product: {
        id: 1,
        name: 'Pollo a la brasa',
        category: 'chicken',
        priceCents: 6500,
        isActive: true,
      },
      quantity: 1,
      portion: 'quarter',
      cut: 'leg',
    },
    {
      product: { id: 3, name: 'Chaufa', category: 'dish', priceCents: 1400, isActive: true },
      quantity: 1,
      portion: null,
      cut: null,
    },
    {
      product: {
        id: 8,
        name: 'Arroz chaufa extra',
        category: 'extra',
        priceCents: 300,
        isActive: false,
      },
      quantity: 1,
      portion: null,
      cut: null,
    },
  ],
};
const INCA = {
  id: 4,
  name: 'Inca Kola',
  category: 'drink',
  priceCents: 400,
  portions: [],
  items: [],
};
const TRES_LECHES = {
  id: 5,
  name: 'Tres Leches',
  category: 'dessert',
  priceCents: 500,
  portions: [],
  items: [],
};
const AJI = { id: 6, name: 'Ají', category: 'sauce', priceCents: 0, portions: [], items: [] };
const OCOPA = { id: 7, name: 'Ocopa', category: 'sauce', priceCents: 300, portions: [], items: [] };
const ARROZ = {
  id: 9,
  name: 'Porción de arroz',
  category: 'extra',
  priceCents: 300,
  portions: [],
  items: [],
};
const MENU = [POLLO, MOSTRITO, CHAUFA, INCA, TRES_LECHES, AJI, OCOPA, POLLO_FRITO, ARROZ];

const TICKET_INICIAL = {
  id: 5,
  orderId: 41,
  kind: 'initial',
  items: [],
  createdBy: JUAN,
  createdAt: '2026-10-11T15:05:00.000Z',
};
const INVENTORY_OFF = {
  chicken: { enabled: false, breastEighths: 0, legEighths: 0 },
  drinks: [{ productId: 4, productName: 'Inca Kola', enabled: false, quantity: 0 }],
  generatedAt: '2026-10-17T15:00:00.000Z',
};
const INVENTORY_AVAILABLE = {
  ...INVENTORY_OFF,
  drinks: [{ productId: 4, productName: 'Inca Kola', enabled: true, quantity: 2 }],
};

function show(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return Object.assign(render(<QueryClientProvider client={client}>{node}</QueryClientProvider>), {
    queryClient: client,
  });
}
function mockSession(session: JsonValue = SESSION_WAITER) {
  server.use(http.get('*/api/auth/me', () => HttpResponse.json(session)));
}
function mockMenu(products: JsonValue[] = MENU) {
  server.use(http.get('*/api/menu', () => HttpResponse.json({ products })));
}
/** Pantalla lista: carta servida y encabezado visible. */
async function renderAgregar() {
  const view = show(<AgregarPage />);
  await screen.findByRole('heading', { name: 'Agregar ítems', level: 1 });
  return view;
}
/** Toca la tarjeta del producto para abrir su editor. */
async function openEditor(name: string | RegExp) {
  fireEvent.click(await screen.findByRole('button', { name }));
}
/** Línea del carrito: el <li>/listitem que contiene el nombre y su 'Quitar'. */
function cartLine(name: RegExp | string) {
  for (const el of screen.getAllByText(name)) {
    const row = el.closest('li, [role="listitem"]');
    if (row && within(row as HTMLElement).queryByRole('button', { name: /quitar/i })) {
      return row as HTMLElement;
    }
  }
  throw new Error(`línea de carrito no encontrada: ${name}`);
}
/** 'Agregar al pedido' del editor abierto (el último si hubiera varios). */
function addToCart() {
  fireEvent.click(screen.getAllByRole('button', { name: 'Agregar al pedido' }).at(-1)!);
}
function selectedOptionText(select: HTMLElement) {
  const el = select as HTMLSelectElement;
  return el.options[el.selectedIndex]?.textContent;
}
function optionNames(select: HTMLElement) {
  return within(select)
    .getAllByRole('option')
    .map((o) => o.textContent);
}

describe('011: toma de pedido y carrito (/mozo/mesas/[tableId]/agregar)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/mozo/mesas/3/agregar');
    mocks.params.tableId = '3';
    mockSession();
    server.use(
      http.get('*/api/tables', () => HttpResponse.json({ tables: [MESA3] })),
      http.get('*/api/orders/41', () => HttpResponse.json(ORDER)),
      http.get('*/api/orders/41/tickets', () => HttpResponse.json({ tickets: [] })),
      // Inventario opt-in por prueba: las regresiones anteriores conservan el estado apagado.
      http.get('*/api/inventory/availability', () => HttpResponse.json(INVENTORY_OFF)),
    );
    mockMenu();
  });

  it('AC-15: secciones por categoría en el orden de la carta y tarjetas con precio', async () => {
    await renderAgregar();
    expect(screen.getByText('Mesa 3')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Volver al pedido' })).toHaveAttribute(
      'href',
      '/mozo/mesas/3',
    );
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      'Pollo',
      'Combos',
      'Platos',
      'Bebidas',
      'Postres',
      'Cremas',
      'Extras',
    ]);
    const card = screen.getByRole('button', { name: /Pollo a la brasa/ });
    expect(within(card).getByText('S/ 65.00')).toBeVisible();
  });

  it('AC-02/04: buscar y filtrar la carta conserva el carrito al actualizar productos', async () => {
    const view = await renderAgregar();
    await openEditor(/^Chaufa/);
    fireEvent.change(screen.getByLabelText('Observación'), {
      target: { value: 'Sin cebolla' },
    });
    addToCart();
    expect(screen.getByText('Sin cebolla')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Bebidas' }));
    expect(screen.getByRole('button', { name: 'Inca Kola' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Chaufa' })).not.toBeInTheDocument();
    expect(screen.getByText('Sin cebolla')).toBeVisible();

    const search = screen.getByRole('searchbox', { name: 'Buscar producto' });
    fireEvent.change(search, { target: { value: 'inca' } });
    expect(screen.getByRole('button', { name: 'Inca Kola' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Chaufa' })).not.toBeInTheDocument();
    expect(screen.getByText('Sin cebolla')).toBeVisible();

    const refreshedMenu = [...MENU, { ...INCA, id: 11, name: 'Inca Kola sin azúcar' }];
    server.use(http.get('*/api/menu', () => HttpResponse.json({ products: refreshedMenu })));
    await view.queryClient.invalidateQueries({ queryKey: ['waiter', 'menu'] });

    expect(await screen.findByRole('button', { name: 'Inca Kola sin azúcar' })).toBeVisible();
    expect(screen.getByText('Sin cebolla')).toBeVisible();
    expect(screen.getByRole('button', { name: /Enviar a cocina \(1\)/ })).toBeEnabled();
  });

  it('AC-15: Cargando carta..., No se pudo cargar la carta. con Reintentar y La carta está vacía.', async () => {
    server.use(
      http.get('*/api/menu', async () => {
        await delay('infinite');
        return HttpResponse.json({ products: [] });
      }),
    );
    const pending = show(<AgregarPage />);
    expect(await screen.findByRole('status')).toHaveTextContent('Cargando carta...');
    pending.unmount();
    server.use(
      http.get('*/api/menu', () => HttpResponse.json(errorBody('INTERNAL_ERROR'), { status: 500 })),
    );
    show(<AgregarPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar la carta.');
    mockMenu([]);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('La carta está vacía.')).toBeVisible();
  });

  it('AC-15: el editor del pollo limita Presentación y Parte, preselecciona cuarto/pierna y gobierna half/whole', async () => {
    await renderAgregar();
    await openEditor(/Pollo frito/);
    // Solo las presentaciones ofertadas en la carta.
    const presentacionFrito = screen.getByRole('combobox', { name: 'Presentación' });
    expect(optionNames(presentacionFrito)).toEqual(['Cuarto', 'Pollo entero']);
    fireEvent.change(presentacionFrito, {
      target: { value: selectedValueOf(presentacionFrito, 'Cuarto') },
    });
    // La carta solo oferta cuarto de pierna: la Parte no inventa 'Pecho'.
    const parte = screen.getByRole('combobox', { name: 'Parte' });
    expect(optionNames(parte)).toEqual(['Pierna']);
    expect(selectedOptionText(parte)).toBe('Pierna');
    // En entero no hay ni Parte ni Distribución.
    fireEvent.change(presentacionFrito, {
      target: { value: selectedValueOf(presentacionFrito, 'Pollo entero') },
    });
    expect(screen.queryByRole('combobox', { name: 'Parte' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Distribución' })).not.toBeInTheDocument();

    await openEditor(/Pollo a la brasa/);
    const presentacion = screen.getByRole('combobox', { name: 'Presentación' });
    expect(optionNames(presentacion)).toEqual(['Octavo', 'Cuarto', 'Medio pollo', 'Pollo entero']);
    expect(selectedOptionText(presentacion)).toBe('Cuarto');
    // En la brasa el cuarto sí oferta ambas partes; pierna sigue preseleccionada.
    const parteBrasa = screen.getByRole('combobox', { name: 'Parte' });
    expect(optionNames(parteBrasa)).toEqual(['Pecho', 'Pierna']);
    expect(selectedOptionText(parteBrasa)).toBe('Pierna');
    // En medio aparece la Distribución con las cinco sumas válidas, 2+2 preseleccionada.
    fireEvent.change(presentacion, {
      target: { value: selectedValueOf(presentacion, 'Medio pollo') },
    });
    const distribucion = screen.getByRole('combobox', { name: 'Distribución' });
    expect(optionNames(distribucion)).toEqual([
      '2 pecho y 2 pierna',
      '3 pecho y 1 pierna',
      '1 pecho y 3 pierna',
      '4 pecho y 0 pierna',
      '0 pecho y 4 pierna',
    ]);
    expect(selectedOptionText(distribucion)).toBe('2 pecho y 2 pierna');
    expect(screen.queryByRole('combobox', { name: 'Parte' })).not.toBeInTheDocument();
  });

  it('AC-15: plato muestra Cantidad/Cremas/Observación, bebida no trae Cremas y el combo marca desactivados', async () => {
    await renderAgregar();
    // Plato (dish): sin Presentación ni Parte; con Cremas y Observación.
    await openEditor(/^Chaufa/);
    expect(screen.queryByRole('combobox', { name: 'Presentación' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Cantidad')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Ají' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Ocopa' })).toBeInTheDocument();
    expect(screen.getByLabelText('Observación')).toBeInTheDocument();
    // Al marcar una crema nace su Cantidad en 1 (segunda 'Cantidad' de la vista).
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ocopa' }));
    const cantidades = screen.getAllByLabelText(/cantidad/i);
    expect(cantidades.length).toBe(2);
    expect(cantidades.some((c) => (c as HTMLInputElement).value === '1')).toBe(true);
    // Bebida: Cantidad y Observación, pero no Cremas.
    await openEditor(/Inca Kola/);
    expect(screen.getByLabelText('Cantidad')).toBeInTheDocument();
    expect(screen.getByLabelText('Observación')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Ají' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Ocopa' })).not.toBeInTheDocument();
    // Combo: componentes listados (además de la tarjeta del producto); el de
    // pollo lleva el selector de parte con el defecto de la carta; el
    // componente inactivo se muestra ' (desactivado)'.
    await openEditor('Mostrito');
    expect(screen.getAllByText(/Pollo a la brasa/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Chaufa').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Arroz chaufa extra \(desactivado\)/)).toBeInTheDocument();
    const parteCombo = screen.getByRole('combobox', { name: /parte/i });
    expect(selectedOptionText(parteCombo)).toBe('Pierna');
    // Solo el componente de pollo lleva selector de parte.
    expect(screen.getAllByRole('combobox', { name: /parte/i })).toHaveLength(1);
  });

  it('AC-16: agregar pone la línea con su precio, corregir y quitar no tocan la API y el envío cuenta ítems', async () => {
    const posts: unknown[] = [];
    server.use(
      http.post('*/api/orders/41/items', async ({ request }) => {
        posts.push(await request.json());
        return HttpResponse.json({ order: ORDER, ticket: TICKET_INICIAL }, { status: 201 });
      }),
    );
    await renderAgregar();
    // Con el carrito vacío el envío está inhabilitado.
    expect(screen.getByRole('button', { name: 'Enviar a cocina (0)' })).toBeDisabled();
    await openEditor(/Pollo a la brasa/);
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Observación'), { target: { value: 'sin ensalada' } });
    addToCart();
    // La línea del carrito con el precio que cobrará (2 × 1700).
    const linea = cartLine(/Pollo a la brasa/);
    expect(within(linea).getByText(/S\/ 34\.00/)).toBeVisible();
    expect(within(linea).getByText(/sin ensalada/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Enviar a cocina (1)' })).toBeEnabled();
    // Corregir la cantidad en el carrito: 3 → 'S/ 51.00', sin llamar a la API.
    fireEvent.change(within(linea).getByLabelText(/cantidad/i), { target: { value: '3' } });
    expect(within(linea).getByText(/S\/ 51\.00/)).toBeVisible();
    expect(posts).toHaveLength(0);
    // Quitar la línea sin tocar la API.
    fireEvent.click(within(linea).getByRole('button', { name: /quitar/i }));
    expect(screen.getByRole('button', { name: 'Enviar a cocina (0)' })).toBeDisabled();
    expect(posts).toHaveLength(0);
  });

  it('AC-16: al ítem 21 el agregar se bloquea con "Un envío admite hasta 20 ítems." y la observación cuenta N/200', async () => {
    await renderAgregar();
    await openEditor(/^Chaufa/);
    expect(screen.getByText('0/200')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Observación'), { target: { value: 'bien cocido' } });
    expect(screen.getByText('11/200')).toBeVisible();
    for (let i = 0; i < 20; i += 1) {
      if (!screen.queryByRole('button', { name: 'Agregar al pedido' })) await openEditor(/^Chaufa/);
      fireEvent.click(screen.getAllByRole('button', { name: 'Agregar al pedido' }).at(-1)!);
    }
    await screen.findByRole('button', { name: 'Enviar a cocina (20)' });
    if (!screen.queryByRole('button', { name: 'Agregar al pedido' })) await openEditor(/^Chaufa/);
    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar al pedido' }).at(-1)!);
    expect(await screen.findByText('Un envío admite hasta 20 ítems.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Enviar a cocina (20)' })).toBeInTheDocument();
  });

  it('AC-17: enviar hace un solo POST con Idempotency-Key y el cuerpo de D-011-08; tras el 201 vuelve con el aviso', async () => {
    const posts: { body: unknown; key: string | null }[] = [];
    server.use(
      http.post('*/api/orders/41/items', async ({ request }) => {
        posts.push({
          body: await request.json(),
          key: request.headers.get('Idempotency-Key'),
        });
        return HttpResponse.json({ order: ORDER, ticket: TICKET_INICIAL }, { status: 201 });
      }),
    );
    await renderAgregar();
    // Tanda mixta: cuarto pierna ×2 con crema y observación + una bebida.
    await openEditor(/Pollo a la brasa/);
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ocopa' }));
    fireEvent.change(screen.getAllByLabelText(/cantidad/i)[1]!, { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Observación'), { target: { value: 'sin ensalada' } });
    addToCart();
    await openEditor(/Inca Kola/);
    addToCart();
    const send = await screen.findByRole('button', { name: 'Enviar a cocina (2)' });
    fireEvent.click(send);
    fireEvent.click(send);
    await waitFor(() => {
      expect(posts).toHaveLength(1);
    });
    expect(posts[0]!.key).toMatch(/^[\x21-\x7E]{1,128}$/);
    expect(posts[0]!.body).toEqual({
      items: [
        {
          productId: 1,
          quantity: 2,
          portion: 'quarter',
          cut: 'leg',
          notes: 'sin ensalada',
          sauces: [{ productId: 7, quantity: 2 }],
        },
        { productId: 4, quantity: 1 },
      ],
    });
    // Tras el 201: carrito vacío, aviso en sessionStorage y vuelta a la mesa.
    await waitFor(() => {
      expect(
        mocks.replace.mock.calls.concat(mocks.push.mock.calls).map((c: unknown[]) => c[0]),
      ).toContain('/mozo/mesas/3');
    });
    expect(sessionStorage.getItem('polleria:orderNotice')).toBe(
      'Pedido registrado. Consulta la generación de la comanda.',
    );
    expect(screen.getByRole('button', { name: 'Enviar a cocina (0)' })).toBeInTheDocument();
  });

  it('AC-17: tras un fallo de red "Reintentar envío" repite la MISMA clave', async () => {
    const requests: Array<{ key: string | null; body: string }> = [];
    let attempts = 0;
    server.use(
      http.post('*/api/orders/41/items', async ({ request }) => {
        attempts += 1;
        requests.push({
          key: request.headers.get('Idempotency-Key'),
          body: await request.clone().text(),
        });
        if (attempts === 1) return HttpResponse.error();
        return HttpResponse.json({ order: ORDER, ticket: TICKET_INICIAL }, { status: 201 });
      }),
    );
    await renderAgregar();
    await openEditor(/^Chaufa/);
    addToCart();
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar a cocina (1)' }));
    expect(await screen.findByText('No se pudo enviar el pedido.')).toBeVisible();
    expect(
      screen.getByText('Sin conexión con el servidor. Revisa el wifi e intenta de nuevo.'),
    ).toBeVisible();
    // El carrito se conserva y 'Reintentar envío' reusa la clave del intento.
    expect(screen.getByRole('button', { name: 'Enviar a cocina (1)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar envío' }));
    await waitFor(() => {
      expect(requests).toHaveLength(2);
    });
    expect(requests[0]!.key).toMatch(/^[\x21-\x7E]{1,128}$/);
    expect(requests[1]).toEqual(requests[0]);
  });

  it('AC-14: un 409 de stock conserva carrito, muestra faltantes y no reenvía automáticamente', async () => {
    let stockReads = 0;
    const posts: unknown[] = [];
    server.use(
      http.get('*/api/inventory/availability', () => {
        stockReads += 1;
        return HttpResponse.json(INVENTORY_AVAILABLE);
      }),
      http.post('*/api/orders/41/items', async ({ request }) => {
        posts.push(await request.json());
        return HttpResponse.json(
          errorBody('INSUFFICIENT_STOCK', 'No hay stock suficiente para enviar el pedido.', {
            shortages: [{ kind: 'drink', productId: 4, available: 0, required: 2 }],
          }),
          { status: 409 },
        );
      }),
    );
    await renderAgregar();
    await openEditor(/Inca Kola/);
    addToCart();
    const line = cartLine(/Inca Kola/);
    fireEvent.change(within(line).getByLabelText(/cantidad/i), { target: { value: '2' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar a cocina (1)' }));

    expect(await screen.findByText(/no hay stock suficiente/i)).toBeVisible();
    await waitFor(() => expect(stockReads).toBeGreaterThan(1));
    expect(cartLine(/Inca Kola/)).toBeInTheDocument();
    expect(within(cartLine(/Inca Kola/)).getByLabelText(/cantidad/i)).toHaveValue(2);
    expect(posts).toHaveLength(1);
  });

  it('AC-14: error de disponibilidad se anuncia como desconocido y no como saldo cero', async () => {
    server.use(
      http.get('*/api/inventory/availability', () =>
        HttpResponse.json(errorBody('INTERNAL_ERROR'), { status: 500 }),
      ),
    );
    await renderAgregar();
    expect(await screen.findByText(/disponibilidad sin confirmar/i)).toBeVisible();
    expect(screen.queryByText(/disponible: 0/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pollo a la brasa/ })).toBeEnabled();
  });

  it('AC-14/15: respuesta incierta congela cuerpo y clave y el replay se permite con stock agotado', async () => {
    let stock = INVENTORY_AVAILABLE;
    let availabilityReads = 0;
    const observed: Array<{ key: string | null; body: string }> = [];
    let attempts = 0;
    server.use(
      http.get('*/api/inventory/availability', () => {
        availabilityReads += 1;
        return HttpResponse.json(stock);
      }),
      http.post('*/api/orders/41/items', async ({ request }) => {
        observed.push({
          key: request.headers.get('Idempotency-Key'),
          body: await request.clone().text(),
        });
        attempts += 1;
        if (attempts === 1) {
          stock = {
            ...INVENTORY_AVAILABLE,
            drinks: [{ productId: 4, productName: 'Inca Kola', enabled: true, quantity: 0 }],
          };
          return HttpResponse.error();
        }
        return HttpResponse.json({ order: ORDER, ticket: TICKET_INICIAL }, { status: 201 });
      }),
    );
    await renderAgregar();
    await openEditor(/Inca Kola/);
    addToCart();
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar a cocina (1)' }));
    expect(await screen.findByRole('button', { name: 'Reintentar envío' })).toBeVisible();
    expect(within(cartLine(/Inca Kola/)).getByLabelText(/cantidad/i)).toBeDisabled();
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(availabilityReads).toBeGreaterThan(1));
    expect(stock.drinks[0]!.quantity).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar envío' }));
    await waitFor(() => expect(observed).toHaveLength(2));
    expect(observed[1]).toEqual(observed[0]);
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/mozo/mesas/3'));
  });

  it('AC-17: "Enviando..." se muestra mientras sale el POST', async () => {
    server.use(
      http.post('*/api/orders/41/items', async () => {
        await delay(500);
        return HttpResponse.error();
      }),
    );
    await renderAgregar();
    await openEditor(/^Chaufa/);
    addToCart();
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar a cocina (1)' }));
    expect(await screen.findByText('Enviando...')).toBeVisible();
    expect(within(cartLine(/^Chaufa/)).getByLabelText(/cantidad/i)).toBeDisabled();
    expect(await screen.findByRole('button', { name: 'Reintentar envío' })).toBeVisible();
    expect(within(cartLine(/^Chaufa/)).getByLabelText(/cantidad/i)).toBeDisabled();
  });

  it('AC-14: el combo cuarto pierna usa solo pierna, limita el carrito y deja disponibles otras porciones con saldo', async () => {
    let stock = {
      ...INVENTORY_OFF,
      chicken: { enabled: true, breastEighths: 0, legEighths: 2 },
    };
    let availabilityReads = 0;
    server.use(
      http.get('*/api/inventory/availability', () => {
        availabilityReads += 1;
        return HttpResponse.json(stock);
      }),
    );
    await renderAgregar();

    await openEditor('Mostrito');
    expect(screen.getByRole('button', { name: 'Agregar al pedido' })).toBeEnabled();
    addToCart();
    const combo = cartLine('Mostrito');
    const comboQuantity = within(combo).getByLabelText(/cantidad/i);
    fireEvent.change(comboQuantity, { target: { value: '2' } });
    expect(comboQuantity).toHaveValue(1);

    fireEvent.click(within(combo).getByRole('button', { name: /quitar/i }));
    stock = {
      ...INVENTORY_OFF,
      chicken: { enabled: true, breastEighths: 4, legEighths: 6 },
    };
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(availabilityReads).toBeGreaterThan(1));
    const chickenCard = await screen.findByRole('button', { name: /Pollo a la brasa/ });
    expect(
      await within(chickenCard).findByText(
        'Pecho disponible: 4 octavos · Pierna disponible: 6 octavos',
      ),
    ).toBeVisible();
    await openEditor(/Pollo a la brasa/);
    const portion = screen.getByRole('combobox', { name: 'Presentación' });
    fireEvent.change(portion, { target: { value: selectedValueOf(portion, 'Pollo entero') } });
    expect(screen.getByRole('button', { name: 'Agregar al pedido' })).toBeEnabled();
  });

  it('AC-18: un 400 lleva los issues items.N.* a cada línea del carrito y los de raíz arriba', async () => {
    server.use(
      http.post('*/api/orders/41/items', () =>
        HttpResponse.json(
          errorBody('VALIDATION_ERROR', 'Los datos enviados no son válidos.', {
            issues: [
              { path: 'items.0.portion', message: 'La presentación no va con la parte.' },
              { path: 'items.1.sauces.0.productId', message: 'Esa crema no existe.' },
              { path: 'items', message: 'Revisa la tanda completa.' },
            ],
          }),
          { status: 400 },
        ),
      ),
    );
    await renderAgregar();
    await openEditor(/Pollo a la brasa/);
    addToCart();
    await openEditor(/^Chaufa/);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ocopa' }));
    addToCart();
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar a cocina (2)' }));
    const lineaPollo = cartLine(/Pollo a la brasa/);
    const lineaChaufa = cartLine('Chaufa');
    // Los issues por línea llegan con la respuesta 400: espera asíncrona.
    expect(
      await within(lineaPollo).findByText('La presentación no va con la parte.'),
    ).toBeVisible();
    expect(await within(lineaChaufa).findByText('Esa crema no existe.')).toBeVisible();
    expect(await screen.findByText('Revisa la tanda completa.')).toBeVisible();
    // El carrito se conserva con sus dos líneas.
    expect(screen.getByRole('button', { name: 'Enviar a cocina (2)' })).toBeInTheDocument();
  });

  it.each([
    ['ORDER_NOT_OPEN', 'El pedido ya no está abierto.'],
    ['ORDER_ITEMS_LIMIT', 'Un envío admite hasta 20 ítems.'],
    ['IDEMPOTENCY_CONFLICT', 'Esa clave ya se usó con otra tanda.'],
  ])('AC-18: el 409 %s muestra su message y conserva el carrito', async (code, message) => {
    server.use(
      http.post('*/api/orders/41/items', () =>
        HttpResponse.json(errorBody(code, message), { status: 409 }),
      ),
    );
    await renderAgregar();
    await openEditor(/^Chaufa/);
    addToCart();
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar a cocina (1)' }));
    expect(await screen.findByText(message)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Enviar a cocina (1)' })).toBeInTheDocument();
  });

  it('AC-19: una segunda tanda sobre un pedido con ítems envía su POST y crea la comanda Adición', async () => {
    const orderConItems = { ...ORDER, items: [{ id: 11 }], totalCents: 2800 };
    const posts: unknown[] = [];
    server.use(
      http.get('*/api/orders/41', () => HttpResponse.json(orderConItems)),
      http.get('*/api/orders/41/tickets', () => HttpResponse.json({ tickets: [TICKET_INICIAL] })),
      http.post('*/api/orders/41/items', async ({ request }) => {
        posts.push(await request.json());
        return HttpResponse.json(
          {
            order: { ...orderConItems, totalCents: 4200 },
            ticket: { ...TICKET_INICIAL, id: 6, kind: 'additional' },
          },
          { status: 201 },
        );
      }),
    );
    await renderAgregar();
    await openEditor(/Inca Kola/);
    addToCart();
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar a cocina (1)' }));
    await waitFor(() => {
      expect(posts).toHaveLength(1);
    });
    expect(posts[0]).toEqual({ items: [{ productId: 4, quantity: 1 }] });
    await waitFor(() => {
      expect(
        mocks.replace.mock.calls.concat(mocks.push.mock.calls).map((c: unknown[]) => c[0]),
      ).toContain('/mozo/mesas/3');
    });
  });
});

/** Valor de la option visible con ese texto dentro del select (id o etiqueta). */
function selectedValueOf(select: HTMLElement, label: string) {
  const option = within(select)
    .getAllByRole('option')
    .find((o) => o.textContent === label) as HTMLOptionElement;
  return option.value;
}
