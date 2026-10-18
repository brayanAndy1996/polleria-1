import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../msw-server.ts';
import MozoPage from '../../src/app/mozo/page.tsx';
import MesaPage from '../../src/app/mozo/mesas/[tableId]/page.tsx';
import AgregarPage from '../../src/app/mozo/mesas/[tableId]/agregar/page.tsx';
import { hardNavigate } from '../../src/lib/navigation.ts';

/**
 * Auditoría adversarial de la spec 011 (pantallas del mozo, ya en verde con los
 * 62 tests de AC). Los bloques ADV-011-01 a ADV-011-12 demuestran defectos en
 * ROJO — no se "arreglan" debilitando la prueba, el dueño de producción corrige
 * el código. Los bloques ADV-011-13 en adelante son vectores que resistieron y
 * quedan como regresión en verde.
 *
 * Hallazgos en rojo:
 * - ADV-011-01 (alto): el reintento del ciclo de anulación (solicitar / anular /
 *   rechazar) genera una Idempotency-Key NUEVA en lugar de reutilizar la del
 *   intento: la clave se crea dentro de mutationFn en
 *   app/mozo/mesas/[tableId]/page.tsx (RN-011-03, regla de dominio 5 — el propio
 *   comentario de lib/api/order-items.ts promete la reutilización).
 * - ADV-011-02 (alto): los selectores 'Mover a otra mesa' / 'Unir mesa' muestran
 *   la primera candidata pero conservan el valor '': con una sola candidata el
 *   botón queda inhabilitado para siempre (no hay nada que "cambiar" en el
 *   select para que dispare onChange); con varias, el mozo cree tener una mesa
 *   elegida que no se enviaría.
 * - ADV-011-03 (alto): un fallo de red en GET /tables deja el tablero /mozo en
 *   blanco bajo el chrome de sesión: la rama de error solo cubre ApiError
 *   distinto de NETWORK_ERROR, así que no hay 'No se pudo cargar el salón.' ni
 *   'Reintentar' (AC-06). La página de mesa sí lo resuelve bien (ADV-011-20).
 * - ADV-011-04 (medio): la comanda plegada solo lista ítems con presentación:
 *   una comanda de puras bebidas o sueltos se expande vacía — el mozo no puede
 *   verificar qué se envió (D-011-06 promete 'sus ítems resumidos').
 * - ADV-011-05 (bajo): la comanda 'Anulación' devuelta por el POST se anexa sin
 *   deduplicar: si el polling ya la trajo (carrera entre el POST y el
 *   refetchInterval), aparece duplicada hasta la siguiente lectura.
 * - ADV-011-06 (medio): un issue 'items.N.<campo>' del 400 con N fuera del
 *   carrito cae en byIndex y no lo pinta ninguna fila — el mensaje se pierde en
 *   silencio y el mozo solo ve 'No se pudo enviar el pedido.' (misma falla que
 *   ADV-008-14 en carta).
 * - ADV-011-07 (bajo): 'Un envío admite hasta 20 ítems.' persiste tras quitar
 *   una línea — touchCart no limpia cartError.
 * - ADV-011-08 (bajo): los componentes sin presentación llevan un ZWSP entre
 *   palabras ('Arroz\u200b chaufa'): contamina copiar/pegar, la búsqueda del
 *   navegador y la lectura accesible del nombre.
 * - ADV-011-09 (bajo): el tablero renderiza dos h1 ('Mozo' sr-only + 'Mesas').
 * - ADV-011-10 (medio): el esquema 'tolerante' del tablero no tolera un ítem sin
 *   `status`: una sola fila parcial tumba el listado completo del salón — la
 *   tolerancia declarada en el comentario solo cubre claves de sobra.
 * - ADV-011-11 (medio): 'Parte' ofrece Pecho aunque la carta solo venda Pierna —
 *   el precio mostrado cae al priceCents del producto entero (S/ 40.00 por un
 *   cuarto de S/ 15.00) y el cuerpo enviaría una parte que la casa no oferta.
 * - ADV-011-12 (bajo): el campo de motivo no se limpia al cambiar de ítem en el
 *   panel de anulación: el input no controlado conserva el texto del ítem
 *   anterior aunque el estado quedó vacío — el mozo envía '' viendo texto.
 *
 * Vectores que resistieron (regresión en verde): ADV-011-13 estabilidad de la
 * clave de envío (misma en reintento, nueva por intento nuevo), ADV-011-14 corte
 * local de observaciones hostiles, ADV-011-15 saneo local de cantidades,
 * ADV-011-16 textos hostiles pintados literales, ADV-011-17 controles de admin
 * ausentes del DOM del mozo, ADV-011-18 sesión expirada a /login, ADV-011-19 el
 * select de unión excluye mesas del propio pedido y ADV-011-20 la página de mesa
 * sí ofrece reintento ante un fallo de red.
 */
const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  params: { tableId: '3' },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useParams: () => mocks.params,
}));
vi.mock('../../src/lib/navigation.ts', () => ({ hardNavigate: vi.fn() }));

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
    totalCents: 4500,
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
    items: [],
    createdBy: JUAN,
    createdAt: '2026-10-11T15:05:00.000Z',
    ...overrides,
  };
}

const ORDER_VACIO = makeOrder();
const ITEM_POLLO = makeItem();
const ITEM_INCA = makeItem({
  id: 13,
  productId: 4,
  productName: 'Inca Kola',
  productCategory: 'drink',
  quantity: 1,
  priceCents: 400,
  portion: null,
  cut: null,
  breastEighths: 0,
  legEighths: 0,
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
  breastEighths: 0,
  legEighths: 0,
  status: 'void_requested',
  voidRequestedBy: JUAN,
  voidRequestedAt: '2026-10-11T15:20:00.000Z',
  voidRequestReason: 'El cliente se equivocó',
});
const ITEM_POLLO_ANULADO = makeItem({
  status: 'voided',
  voidTicketId: 9,
  voidedBy: ADMIN,
  voidedAt: '2026-10-11T15:30:00.000Z',
  voidReason: 'Error de cocina',
});
const TICKET_ANULACION = makeTicket({ id: 9, kind: 'void', items: [ITEM_POLLO_ANULADO] });
const ORDER_CON_POLLO = makeOrder({ items: [ITEM_POLLO] });
const ORDER_CON_POLLO_ANULADO = makeOrder({ items: [ITEM_POLLO_ANULADO] });
const ORDER_PEDIDA = makeOrder({ items: [ITEM_CHAUFA_PEDIDA] });

const MESA1 = { id: 1, name: 'Mesa 1', isActive: true, state: 'free', order: null };
const MESA2 = { id: 2, name: 'Mesa 2', isActive: true, state: 'free', order: null };

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
const SALON = [MESA1, MESA2, MESA3_OCUPADA, MESA5_OCUPADA];

const CHAUFA = {
  id: 3,
  name: 'Chaufa',
  category: 'dish',
  priceCents: 1400,
  portions: [],
  items: [],
};
const INCA = {
  id: 4,
  name: 'Inca Kola',
  category: 'drink',
  priceCents: 400,
  portions: [],
  items: [],
};
/** Pollo que la casa solo oferta en cuarto de pierna y entero: no hay pecho. */
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
const MENU = [POLLO_FRITO, CHAUFA, INCA];
const INVENTORY_OFF = {
  chicken: { enabled: false, breastEighths: 0, legEighths: 0 },
  drinks: [{ productId: 4, productName: 'Inca Kola', enabled: false, quantity: 0 }],
  generatedAt: '2026-10-17T15:00:00.000Z',
};

function show(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return {
    client,
    ...render(<QueryClientProvider client={client}>{node}</QueryClientProvider>),
  };
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
function mockMenu(products: JsonValue[] = MENU) {
  server.use(http.get('*/api/menu', () => HttpResponse.json({ products })));
}
/** Mesa ocupada con su detalle encadenado listo para la vista. */
async function renderMesaOcupada(
  order: JsonValue = ORDER_VACIO,
  tickets: JsonValue[] = [],
  tables: JsonValue[] = SALON,
) {
  mockSalon(tables);
  mockOrder(order);
  mockTickets(tickets);
  const view = show(<MesaPage />);
  expect(await screen.findByRole('heading', { name: 'Pedido', level: 2 })).toBeVisible();
  expect(await screen.findByRole('heading', { name: 'Mesa 3', level: 1 })).toBeVisible();
  return view;
}
/** La toma de pedido lista con la mesa 3 ocupada y la carta servida. */
async function renderAgregar(products: JsonValue[] = MENU) {
  mockMenu(products);
  server.use(
    http.get('*/api/tables', () => HttpResponse.json({ tables: [MESA3_OCUPADA] })),
    http.get('*/api/orders/41', () => HttpResponse.json(ORDER_VACIO)),
    http.get('*/api/orders/41/tickets', () => HttpResponse.json({ tickets: [] })),
    // Inventario opt-in: las pruebas históricas conservan el comportamiento sin control activo.
    http.get('*/api/inventory/availability', () => HttpResponse.json(INVENTORY_OFF)),
  );
  const view = show(<AgregarPage />);
  expect(await screen.findByRole('heading', { name: 'Agregar ítems', level: 1 })).toBeVisible();
  return view;
}
/** Abre el editor de la tarjeta del producto. */
async function openEditor(name: string | RegExp) {
  fireEvent.click(await screen.findByRole('button', { name }));
}
/** 'Agregar al pedido' del editor abierto (el último si hubiera varios). */
function addToCart() {
  fireEvent.click(screen.getAllByRole('button', { name: 'Agregar al pedido' }).at(-1)!);
}
/** Línea del carrito: el <li> que contiene el nombre y su 'Quitar'. */
function cartLine(name: RegExp | string) {
  for (const el of screen.getAllByText(name)) {
    const row = el.closest('li, [role="listitem"]');
    if (row && within(row as HTMLElement).queryByRole('button', { name: 'Quitar' })) {
      return row as HTMLElement;
    }
  }
  throw new Error(`línea de carrito no encontrada: ${name}`);
}
/** Fila de ítem del pedido: el <li> que contiene ese texto. */
function itemRow(name: RegExp | string) {
  const row = screen.getByText(name).closest('li, [role="listitem"]');
  if (!row) throw new Error(`fila de ítem no encontrada: ${name}`);
  return row as HTMLElement;
}
/** Manejador del POST que falla una vez (red) y luego responde; guarda las claves. */
function captureVoidKeys(path: string, okBody: JsonValue, keys: string[]) {
  let calls = 0;
  server.use(
    http.post(`*${path}`, ({ request }) => {
      calls += 1;
      keys.push(request.headers.get('Idempotency-Key') ?? '');
      if (calls === 1) return HttpResponse.error();
      return HttpResponse.json(okBody);
    }),
  );
}
function optionNames(select: HTMLElement) {
  return within(select)
    .queryAllByRole('option')
    .map((o) => o.textContent);
}

describe('ADV-011-01: el reintento del ciclo de anulación reusa la clave del intento (RN-011-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/mozo/mesas/3');
    mocks.params.tableId = '3';
  });

  it('la solicitud de anulación del mozo envía la MISMA clave al reintentar tras un fallo de red', async () => {
    mockSession();
    const keys: string[] = [];
    captureVoidKeys('/api/orders/41/items/11/request-void', { order: ORDER_CON_POLLO }, keys);
    await renderMesaOcupada(ORDER_CON_POLLO);
    fireEvent.click(
      within(itemRow(/Pollo a la brasa/)).getByRole('button', { name: 'Solicitar anulación' }),
    );
    fireEvent.change(screen.getByLabelText('Motivo de la anulación'), {
      target: { value: 'El cliente se equivocó' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
    expect(await screen.findByText(/Sin conexión con el servidor/)).toBeVisible();
    // El diálogo sigue abierto: el mozo reintenta el MISMO intento.
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).toBe(keys[0]);
  });

  it('la anulación directa del admin envía la MISMA clave al reintentar', async () => {
    mockSession(SESSION_ADMIN);
    const keys: string[] = [];
    captureVoidKeys(
      '/api/orders/41/items/11/void',
      { order: ORDER_CON_POLLO_ANULADO, ticket: TICKET_ANULACION },
      keys,
    );
    await renderMesaOcupada(ORDER_CON_POLLO);
    fireEvent.click(within(itemRow(/Pollo a la brasa/)).getByRole('button', { name: 'Anular' }));
    fireEvent.change(screen.getByLabelText('Motivo de la anulación'), {
      target: { value: 'Error de cocina' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
    expect(await screen.findByText(/Sin conexión con el servidor/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).toBe(keys[0]);
  });

  it('el rechazo del admin envía la MISMA clave al reintentar', async () => {
    mockSession(SESSION_ADMIN);
    const keys: string[] = [];
    captureVoidKeys('/api/orders/41/items/14/reject-void', { order: ORDER_PEDIDA }, keys);
    await renderMesaOcupada(ORDER_PEDIDA);
    fireEvent.click(within(itemRow('Chaufa')).getByRole('button', { name: 'Rechazar solicitud' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, rechazar' }));
    expect(await screen.findByText(/Sin conexión con el servidor/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, rechazar' }));
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).toBe(keys[0]);
  });
});

describe('ADV-011-02: mover/unir ofrece la mesa que muestra seleccionada', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/mozo/mesas/3');
    mocks.params.tableId = '3';
    mockSession();
  });

  it('con una sola mesa libre, "Mover" queda habilitado con ella ya elegida', async () => {
    await renderMesaOcupada(ORDER_VACIO, [], [MESA3_OCUPADA, MESA1]);
    fireEvent.click(screen.getByRole('button', { name: 'Mover a otra mesa' }));
    const select = screen.getByRole<HTMLSelectElement>('combobox');
    expect(optionNames(select)).toEqual(['Mesa 1']);
    // El select muestra 'Mesa 1' pero el estado interno sigue vacío.
    expect(screen.getByRole('button', { name: 'Mover' })).toBeEnabled();
  });

  it('con una sola mesa ocupada ajena, "Unir" queda habilitado con ella ya elegida', async () => {
    await renderMesaOcupada(ORDER_VACIO, [], [MESA3_OCUPADA, MESA5_OCUPADA]);
    fireEvent.click(screen.getByRole('button', { name: 'Unir mesa' }));
    const select = screen.getByRole<HTMLSelectElement>('combobox');
    expect(optionNames(select)).toEqual(['Mesa 5']);
    expect(screen.getByRole('button', { name: 'Unir' })).toBeEnabled();
  });
});

describe('ADV-011-03: un fallo de red no deja el tablero en blanco (AC-06)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    mockSession();
  });

  it('un fallo de red en GET /tables muestra "No se pudo cargar el salón." y "Reintentar"', async () => {
    server.use(http.get('*/api/tables', () => HttpResponse.error()));
    show(<MozoPage />);
    // La sesión se resuelve y el chrome aparece; el contenido queda vacío.
    expect(await screen.findByText(/Juan/)).toBeVisible();
    expect(screen.getByText('No se pudo cargar el salón.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  });
});

describe('ADV-011-04: la comanda plegada resume todos sus ítems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/mozo/mesas/3');
    mocks.params.tableId = '3';
    mockSession();
  });

  it('una comanda de puras bebidas lista su Inca Kola', async () => {
    const ticketBebidas = makeTicket({ id: 6, kind: 'additional', items: [ITEM_INCA] });
    await renderMesaOcupada(ORDER_CON_POLLO, [ticketBebidas]);
    const comanda = screen.getByText('Adición').closest('li');
    expect(comanda).not.toBeNull();
    expect(within(comanda as HTMLElement).queryByText(/Inca Kola/)).not.toBeNull();
  });
});

describe('ADV-011-05: la comanda de anulación no se duplica si el polling ya la trajo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/mozo/mesas/3');
    mocks.params.tableId = '3';
    mockSession(SESSION_ADMIN);
  });

  it('la comanda devuelta por el POST no se anexa cuando ya está en la lista', async () => {
    // Carrera determinista: el POST queda retenido; en ese lapso el refetch del
    // detalle ya trae la comanda de anulación recién emitida y el pedido anulado.
    let posted = false;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    server.use(
      http.post('*/api/orders/41/items/11/void', async () => {
        posted = true;
        await gate;
        return HttpResponse.json({ order: ORDER_CON_POLLO_ANULADO, ticket: TICKET_ANULACION });
      }),
    );
    const view = await renderMesaOcupada(ORDER_CON_POLLO, []);
    fireEvent.click(within(itemRow(/Pollo a la brasa/)).getByRole('button', { name: 'Anular' }));
    fireEvent.change(screen.getByLabelText('Motivo de la anulación'), {
      target: { value: 'Error de cocina' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
    await waitFor(() => expect(posted).toBe(true));
    server.use(
      http.get('*/api/orders/41', () => HttpResponse.json(ORDER_CON_POLLO_ANULADO)),
      http.get('*/api/orders/41/tickets', () => HttpResponse.json({ tickets: [TICKET_ANULACION] })),
    );
    await view.client.refetchQueries({ queryKey: ['waiter', 'mesa', 3] });
    // El POST responde: la comanda ya estaba en la lista del detalle.
    release();
    await waitFor(() => expect(screen.queryByLabelText('Motivo de la anulación')).toBeNull());
    expect(screen.getAllByText('Anulación')).toHaveLength(1);
  });
});

describe('ADV-011-06: un issue de línea fuera de rango del carrito se muestra', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/mozo/mesas/3/agregar');
    mocks.params.tableId = '3';
    mockSession();
  });

  it('un issue items.N.* con N sin línea pinta su mensaje en la sección de envío', async () => {
    server.use(
      http.post('*/api/orders/41/items', () =>
        HttpResponse.json(
          errorBody('VALIDATION_ERROR', 'Revisa los datos.', {
            issues: [
              { path: 'items.7.quantity', message: 'La fila 8 lleva una cantidad no válida.' },
            ],
          }),
          { status: 400 },
        ),
      ),
    );
    await renderAgregar();
    await openEditor('Chaufa');
    addToCart();
    fireEvent.click(screen.getByRole('button', { name: /Enviar a cocina/ }));
    expect(await screen.findByText('No se pudo enviar el pedido.')).toBeVisible();
    // El issue cayó en byIndex[7] sin fila que lo pinte: no debe perderse.
    expect(screen.getByText('La fila 8 lleva una cantidad no válida.')).toBeVisible();
  });
});

describe('ADV-011-07: el aviso de tope de envío se limpia al quitar una línea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/mozo/mesas/3/agregar');
    mocks.params.tableId = '3';
    mockSession();
  });

  it('tras quitar una línea del carrito lleno, "Un envío admite hasta 20 ítems." desaparece', async () => {
    await renderAgregar();
    await openEditor('Chaufa');
    for (let i = 0; i < 20; i += 1) addToCart();
    addToCart(); // ítem 21: no entra y deja el aviso
    expect(screen.getByText('Un envío admite hasta 20 ítems.')).toBeVisible();
    fireEvent.click(within(cartLine('Chaufa')).getByRole('button', { name: 'Quitar' }));
    expect(screen.queryByText('Un envío admite hasta 20 ítems.')).toBeNull();
  }, 15_000);
});

describe('ADV-011-08: los nombres de componentes no llevan caracteres invisibles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/mozo/mesas/3');
    mocks.params.tableId = '3';
    mockSession();
  });

  it('el componente sin presentación no inyecta un espacio de ancho cero', async () => {
    const itemCombo = makeItem({
      id: 15,
      productId: 2,
      productName: 'Mostrito',
      productCategory: 'combo',
      quantity: 1,
      priceCents: 2200,
      portion: null,
      cut: null,
      breastEighths: 0,
      legEighths: 0,
      components: [
        {
          productId: 8,
          productName: 'Arroz chaufa',
          quantity: 1,
          portion: null,
          cut: null,
          breastEighths: 0,
          legEighths: 0,
        },
      ],
    });
    await renderMesaOcupada(makeOrder({ items: [itemCombo] }));
    const componente = within(itemRow('Mostrito')).getByText(/Arroz/);
    expect(componente.textContent).not.toContain('\u200b');
  });
});

describe('ADV-011-09: el tablero tiene un único encabezado de nivel 1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    mockSession();
    mockSalon();
  });

  it('solo hay un h1 en /mozo', async () => {
    show(<MozoPage />);
    expect(await screen.findByRole('heading', { name: 'Mesas', level: 1 })).toBeVisible();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});

describe('ADV-011-10: un ítem parcial del pedido no tumba el tablero entero', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    mockSession();
  });

  it('la tarjeta se pinta aunque un ítem del pedido embebido no traiga status', async () => {
    const mesaParcial = {
      ...MESA3_OCUPADA,
      order: { ...makeOrder(), items: [{ id: 1 }] },
    };
    mockSalon([MESA1, mesaParcial]);
    show(<MozoPage />);
    expect(await screen.findByText('Mesa 1')).toBeVisible();
    expect(screen.getByText('Mesa 3')).toBeVisible();
  });
});

describe('ADV-011-11: la parte elegible se limita a lo ofertado por la carta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/mozo/mesas/3/agregar');
    mocks.params.tableId = '3';
    mockSession();
  });

  it('un pollo que solo oferta pierna no deja elegir "Pecho"', async () => {
    await renderAgregar([POLLO_FRITO]);
    await openEditor('Pollo frito');
    const parte = screen.getByLabelText<HTMLSelectElement>('Parte');
    expect(optionNames(parte)).toEqual(['Pierna']);
  });

  it('el precio de la línea no cae al del producto entero con una parte no ofertada', async () => {
    await renderAgregar([POLLO_FRITO]);
    await openEditor('Pollo frito');
    fireEvent.change(screen.getByLabelText('Parte'), { target: { value: 'breast' } });
    addToCart();
    const linea = cartLine('Pollo frito');
    // La carta no tiene cuarto de pecho: mostrar S/ 40.00 (el entero) engaña al mozo.
    expect(within(linea).queryByText(/S\/ 40\.00/)).toBeNull();
  });
});

describe('ADV-011-12: el motivo no se arrastra entre ítems del panel de anulación', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/mozo/mesas/3');
    mocks.params.tableId = '3';
    mockSession();
  });

  it('al cambiar de ítem el campo de motivo queda vacío', async () => {
    const itemChaufa = makeItem({
      id: 12,
      productId: 3,
      productName: 'Chaufa',
      productCategory: 'dish',
      quantity: 1,
      priceCents: 1400,
      portion: null,
      cut: null,
      breastEighths: 0,
      legEighths: 0,
    });
    await renderMesaOcupada(makeOrder({ items: [ITEM_POLLO, itemChaufa] }));
    fireEvent.click(
      within(itemRow(/Pollo a la brasa/)).getByRole('button', { name: 'Solicitar anulación' }),
    );
    fireEvent.change(screen.getByLabelText('Motivo de la anulación'), {
      target: { value: 'Motivo del pollo' },
    });
    fireEvent.click(within(itemRow('Chaufa')).getByRole('button', { name: 'Solicitar anulación' }));
    const input = screen.getByLabelText<HTMLInputElement>('Motivo de la anulación');
    expect(input.value).toBe('');
  });
});

describe('ADV-011-13 (resuelto): la clave del envío es estable por intento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/mozo/mesas/3/agregar');
    mocks.params.tableId = '3';
    mockSession();
  });

  it('el reintento tras un fallo de red reusa la misma Idempotency-Key', async () => {
    const keys: string[] = [];
    let calls = 0;
    server.use(
      http.post('*/api/orders/41/items', ({ request }) => {
        calls += 1;
        keys.push(request.headers.get('Idempotency-Key') ?? '');
        if (calls === 1) return HttpResponse.error();
        return HttpResponse.json({ order: ORDER_VACIO, ticket: makeTicket() }, { status: 201 });
      }),
    );
    await renderAgregar();
    await openEditor('Chaufa');
    addToCart();
    fireEvent.click(screen.getByRole('button', { name: /Enviar a cocina/ }));
    expect(await screen.findByText('No se pudo enviar el pedido.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar envío' }));
    await waitFor(() => expect(calls).toBe(2));
    expect(keys[1]).toBe(keys[0]);
  });

  it('una respuesta incierta congela el carrito y reintenta la misma clave y cuerpo', async () => {
    const requests: Array<{ key: string; body: string }> = [];
    let calls = 0;
    server.use(
      http.post('*/api/orders/41/items', async ({ request }) => {
        calls += 1;
        requests.push({
          key: request.headers.get('Idempotency-Key') ?? '',
          body: await request.clone().text(),
        });
        if (calls === 1) return HttpResponse.error();
        return HttpResponse.json({ order: ORDER_VACIO, ticket: makeTicket() }, { status: 201 });
      }),
    );
    await renderAgregar();
    await openEditor('Chaufa');
    addToCart();
    await openEditor('Inca Kola');
    addToCart();
    fireEvent.click(screen.getByRole('button', { name: /Enviar a cocina/ }));
    expect(await screen.findByText('No se pudo enviar el pedido.')).toBeVisible();
    const drinkLine = cartLine('Inca Kola');
    expect(within(drinkLine).getByLabelText(/cantidad/i)).toBeDisabled();
    const removeDrink = within(drinkLine).getByRole('button', { name: 'Quitar' });
    expect(removeDrink).toBeDisabled();
    fireEvent.click(removeDrink);
    expect(cartLine('Inca Kola')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar envío' }));
    await waitFor(() => expect(calls).toBe(2));
    expect(requests[1]).toEqual(requests[0]);
  });

  it('un rechazo definitivo permite editar y crea una clave nueva para el nuevo cuerpo', async () => {
    const requests: Array<{ key: string; body: string }> = [];
    let calls = 0;
    server.use(
      http.post('*/api/orders/41/items', async ({ request }) => {
        calls += 1;
        requests.push({
          key: request.headers.get('Idempotency-Key') ?? '',
          body: await request.clone().text(),
        });
        if (calls === 1) {
          return HttpResponse.json(errorBody('ORDER_NOT_OPEN', 'El pedido ya no está abierto.'), {
            status: 409,
          });
        }
        return HttpResponse.json({ order: ORDER_VACIO, ticket: makeTicket() }, { status: 201 });
      }),
    );
    await renderAgregar();
    await openEditor('Chaufa');
    addToCart();
    await openEditor('Inca Kola');
    addToCart();
    fireEvent.click(screen.getByRole('button', { name: /Enviar a cocina/ }));
    expect(await screen.findByText('El pedido ya no está abierto.')).toBeVisible();
    const drinkLine = cartLine('Inca Kola');
    expect(within(drinkLine).getByRole('button', { name: 'Quitar' })).toBeEnabled();
    fireEvent.click(within(drinkLine).getByRole('button', { name: 'Quitar' }));
    expect(screen.getByRole('button', { name: /Enviar a cocina \(1\)/ })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Enviar a cocina/ }));
    await waitFor(() => expect(calls).toBe(2));
    expect(requests[0]!.key).not.toBe('');
    expect(requests[1]!.key).not.toBe(requests[0]!.key);
    expect(requests[1]!.body).not.toBe(requests[0]!.body);
  });

  it('una tanda nueva tras el 201 genera una clave nueva', async () => {
    const keys: string[] = [];
    server.use(
      http.post('*/api/orders/41/items', ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key') ?? '');
        return HttpResponse.json({ order: ORDER_VACIO, ticket: makeTicket() }, { status: 201 });
      }),
    );
    await renderAgregar();
    await openEditor('Chaufa');
    addToCart();
    fireEvent.click(screen.getByRole('button', { name: /Enviar a cocina/ }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/mozo/mesas/3'));
    addToCart();
    fireEvent.click(screen.getByRole('button', { name: /Enviar a cocina/ }));
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).not.toBe(keys[0]);
    expect(keys[1]).not.toBe('');
  });
});

describe('ADV-011-14 (resuelto): la validación local corta observaciones hostiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/mozo/mesas/3/agregar');
    mocks.params.tableId = '3';
    mockSession();
  });

  it('una observación con un carácter de control bloquea el envío y el issue cae en su línea', async () => {
    let posts = 0;
    server.use(
      http.post('*/api/orders/41/items', () => {
        posts += 1;
        return HttpResponse.json({ order: ORDER_VACIO, ticket: makeTicket() }, { status: 201 });
      }),
    );
    await renderAgregar();
    await openEditor('Chaufa');
    fireEvent.change(screen.getByLabelText('Observación'), { target: { value: 'con\ttab' } });
    addToCart();
    fireEvent.click(screen.getByRole('button', { name: /Enviar a cocina/ }));
    expect(
      await within(cartLine('Chaufa')).findByText(
        'La observación admite hasta 200 caracteres en una sola línea.',
      ),
    ).toBeVisible();
    expect(posts).toBe(0);
  });

  it('una observación de más de 200 caracteres se bloquea en local', async () => {
    let posts = 0;
    server.use(
      http.post('*/api/orders/41/items', () => {
        posts += 1;
        return HttpResponse.json({ order: ORDER_VACIO, ticket: makeTicket() }, { status: 201 });
      }),
    );
    await renderAgregar();
    await openEditor('Chaufa');
    fireEvent.change(screen.getByLabelText('Observación'), {
      target: { value: 'a'.repeat(201) },
    });
    addToCart();
    fireEvent.click(screen.getByRole('button', { name: /Enviar a cocina/ }));
    expect(
      await within(cartLine('Chaufa')).findByText(
        'La observación admite hasta 200 caracteres en una sola línea.',
      ),
    ).toBeVisible();
    expect(posts).toBe(0);
  });
});

describe('ADV-011-15 (resuelto): la cantidad se sanea en local', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/mozo/mesas/3/agregar');
    mocks.params.tableId = '3';
    mockSession();
  });

  it('una cantidad por encima del tope se corta en local y el POST no sale', async () => {
    let posts = 0;
    server.use(
      http.post('*/api/orders/41/items', () => {
        posts += 1;
        return HttpResponse.json({ order: ORDER_VACIO, ticket: makeTicket() }, { status: 201 });
      }),
    );
    await renderAgregar();
    await openEditor('Chaufa');
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '150' } });
    addToCart();
    fireEvent.click(screen.getByRole('button', { name: /Enviar a cocina/ }));
    expect(
      await within(cartLine('Chaufa')).findByText('Indica cuántas unidades lleva el ítem.'),
    ).toBeVisible();
    expect(posts).toBe(0);
  });

  it.each(['0', '-5', 'abc'])('la cantidad "%s" se normaliza a 1 al agregar', async (value) => {
    await renderAgregar();
    await openEditor('Chaufa');
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value } });
    addToCart();
    expect(within(cartLine('Chaufa')).getByText(/1 ×/)).toBeVisible();
  });
});

describe('ADV-011-16 (resuelto): los textos hostiles se pintan literales', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/mozo/mesas/3');
    mocks.params.tableId = '3';
    mockSession();
  });

  it('script, img y svg en nombres, observación y motivo no inyectan elementos', async () => {
    const itemXss = makeItem({
      id: 16,
      productId: 4,
      productName: 'Inca <img src=x onerror=alert(1)>',
      productCategory: 'drink',
      quantity: 1,
      priceCents: 400,
      portion: null,
      cut: null,
      breastEighths: 0,
      legEighths: 0,
      notes: '<script>alert(1)</script>',
    });
    const itemMotivo = makeItem({
      ...ITEM_CHAUFA_PEDIDA,
      voidRequestReason: '"><svg onload=alert(2)>',
    });
    const view = await renderMesaOcupada(makeOrder({ items: [itemXss, itemMotivo] }));
    expect(screen.getByText('<script>alert(1)</script>')).toBeVisible();
    expect(screen.getByText(/Inca <img/)).toBeVisible();
    expect(screen.getByText(/<svg onload/)).toBeVisible();
    expect(view.container.querySelector('img')).toBeNull();
    expect(view.container.querySelector('script')).toBeNull();
  });
});

describe('ADV-011-17 (resuelto): el mozo no ve controles de admin ni comandas de anulación', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/mozo/mesas/3');
    mocks.params.tableId = '3';
    mockSession();
  });

  it('los botones de admin no existen en el DOM del mozo (no es ocultamiento CSS)', async () => {
    await renderMesaOcupada(makeOrder({ items: [ITEM_POLLO, ITEM_CHAUFA_PEDIDA] }), [
      TICKET_ANULACION,
    ]);
    expect(screen.getByRole('button', { name: 'Solicitar anulación' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Anular' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Aprobar anulación' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rechazar solicitud' })).toBeNull();
    // La comanda 'Anulación' tampoco se pinta para el mozo.
    expect(screen.queryByText('Anulación')).toBeNull();
  });
});

describe('ADV-011-18 (resuelto): la sesión expirada corta el flujo a /login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/mozo/mesas/3/agregar');
    mocks.params.tableId = '3';
    mockSession();
  });

  it('un 401 en medio del envío llama a hardNavigate("/login")', async () => {
    server.use(
      http.post('*/api/orders/41/items', () =>
        HttpResponse.json(errorBody('UNAUTHENTICATED', 'Sesión expirada.'), { status: 401 }),
      ),
    );
    await renderAgregar();
    await openEditor('Chaufa');
    addToCart();
    fireEvent.click(screen.getByRole('button', { name: /Enviar a cocina/ }));
    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith('/login'));
  });
});

describe('ADV-011-19 (resuelto): unir excluye las mesas del propio pedido', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/mozo/mesas/3');
    mocks.params.tableId = '3';
    mockSession();
  });

  it('la mesa cubierta por el mismo pedido no aparece en el selector de unión', async () => {
    const ordenUnida = makeOrder({
      id: 41,
      tables: [
        { id: 3, name: 'Mesa 3' },
        { id: 5, name: 'Mesa 5' },
      ],
    });
    const mesa5Cubierta = {
      id: 5,
      name: 'Mesa 5',
      isActive: true,
      state: 'occupied',
      order: ordenUnida,
    };
    await renderMesaOcupada(
      ordenUnida,
      [],
      [{ ...MESA3_OCUPADA, order: ordenUnida }, mesa5Cubierta],
    );
    fireEvent.click(screen.getByRole('button', { name: 'Unir mesa' }));
    const select = screen.getByRole<HTMLSelectElement>('combobox');
    expect(optionNames(select)).not.toContain('Mesa 5');
  });
});

describe('ADV-011-20 (resuelto): la página de mesa sí ofrece reintento ante un fallo de red', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/mozo/mesas/3');
    mocks.params.tableId = '3';
    mockSession();
  });

  it('un fallo de red en GET /tables muestra "No se pudo cargar el salón." y "Reintentar"', async () => {
    server.use(http.get('*/api/tables', () => HttpResponse.error()));
    show(<MesaPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el salón.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  });
});
