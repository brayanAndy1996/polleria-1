import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, delay, http } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../msw-server.ts';
import CartaPage from '../../src/app/admin/carta/page.tsx';
import NuevoPage from '../../src/app/admin/carta/nuevo/page.tsx';
import EditPage from '../../src/app/admin/carta/[id]/page.tsx';
import { ApiError, createApiClient } from '../../src/lib/api/client.ts';
import { issuesFromApiError, sectionMessages, splitIssues } from '../../src/lib/api/issues.ts';
import { hardNavigate } from '../../src/lib/navigation.ts';

/**
 * Auditoría adversarial de la spec 008. La mayoría de estos casos son
 * regresiones en verde (protegen decisiones sanas); los ADV-008-04 a 08
 * demuestran defectos en rojo y NO se deben "arreglar" debilitando la prueba.
 *
 * MSW 3 gana el PRIMERO que coincide: los manejadores específicos se registran
 * antes que los comodines `:productId`, igual que en los tests del test-writer.
 */
const mocks = vi.hoisted(() => ({ params: { id: '1' }, replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useParams: () => mocks.params,
}));
vi.mock('../../src/lib/navigation.ts', () => ({ hardNavigate: vi.fn() }));

const SESSION_ADMIN = {
  user: { id: 1, username: 'dueno', displayName: 'Carlos', roles: ['admin'] },
  expiresAt: '2026-10-09T07:00:00.000Z',
};
const POLLO = { id: 1, name: 'E2E Pollo', category: 'chicken', priceCents: 6500, isActive: true };
const COMBO = { id: 2, name: 'Mostrito', category: 'combo', priceCents: 3000, isActive: true };
const CHAUFA = { id: 3, name: 'E2E Chaufa', category: 'dish', priceCents: 1400, isActive: true };
const GASEOSA = { id: 4, name: 'E2E Gaseosa', category: 'drink', priceCents: 400, isActive: true };
const POSTRE = { id: 6, name: 'Tres Leches', category: 'dessert', priceCents: 500, isActive: false };
const PRODUCTS = [POLLO, COMBO, CHAUFA, GASEOSA, POSTRE];
const POLLO_PORTIONS = {
  portions: [
    { id: 11, productId: 1, portion: 'quarter', cut: 'breast', priceCents: 1800 },
    { id: 12, productId: 1, portion: 'quarter', cut: 'leg', priceCents: 1700 },
    { id: 13, productId: 1, portion: 'whole', cut: null, priceCents: 6500 },
  ],
};
const ITEMS_LOADED = {
  items: [
    { id: 21, comboId: 2, product: POLLO, quantity: 1, portion: 'quarter', cut: 'leg' },
    { id: 22, comboId: 2, product: CHAUFA, quantity: 1, portion: null, cut: null },
    { id: 23, comboId: 2, product: GASEOSA, quantity: 1, portion: null, cut: null },
  ],
};
const UNAUTHENTICATED = {
  error: { code: 'UNAUTHENTICATED', message: 'Debes iniciar sesión para continuar.', details: null },
};

function mockBase() {
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json(SESSION_ADMIN)),
    http.get('*/api/products/1/portions', () => HttpResponse.json(POLLO_PORTIONS)),
    http.get('*/api/products/2/items', () => HttpResponse.json(ITEMS_LOADED)),
    http.get('*/api/products/2/portions', () => HttpResponse.json({ portions: [] })),
    http.get('*/api/products', () => HttpResponse.json({ products: PRODUCTS })),
    http.get('*/api/products/:productId/items', () => HttpResponse.json({ items: [] })),
    http.get('*/api/products/:productId/portions', () => HttpResponse.json({ portions: [] })),
  );
}

function show(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
function barrier() {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { gate, release };
}
async function renderCombo() {
  mocks.params.id = '2';
  const view = show(<EditPage />);
  expect(
    await screen.findByRole('heading', { name: 'Componentes del combo', level: 2 }),
  ).toBeVisible();
  return view;
}
async function renderChicken(portions: object = POLLO_PORTIONS) {
  mocks.params.id = '1';
  server.use(http.get('*/api/products/1/portions', () => HttpResponse.json(portions)));
  const view = show(<EditPage />);
  expect(
    await screen.findByRole('heading', { name: 'Presentaciones del pollo', level: 2 }),
  ).toBeVisible();
  return view;
}
const componentRow = (index: number) => screen.getByRole('group', { name: `Componente ${index}` });
const portionRow = (label: string) => {
  // El contenedor de la fila es el primer <div> ancestro del checkbox (la
  // grilla completa también es un div.grid y daría falsos positivos).
  const row = screen.getByRole('checkbox', { name: label }).closest('div');
  expect(row).not.toBeNull();
  return row as HTMLElement;
};
const productRow = (name: string) => {
  const row = screen.getByText(name).closest('li');
  expect(row).not.toBeNull();
  return row as HTMLElement;
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.history.replaceState({}, '', '/admin/carta');
  mocks.params.id = '1';
});

describe('ADV-008-04 a 06: comparación del combo con cantidades hostiles', () => {
  beforeEach(() => {
    mocks.params.id = '2';
    mockBase();
  });
  it('ADV-008-04: una cantidad que desborda a Infinity no debería tumbar la página', async () => {
    await renderCombo();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar componente' }));
    const row = componentRow(4);
    fireEvent.change(within(row).getByRole('combobox', { name: 'Producto' }), {
      target: { value: '3' },
    });
    expect(
      await screen.findByText('Los componentes por separado suman S/ 49.00.'),
    ).toBeVisible();
    // '1e306' es un entero válido para Number(): 1400 × 1e306 desborda a
    // Infinity y formatSoles lanza; no hay error boundary en estas pantallas.
    expect(() => {
      fireEvent.change(within(row).getByLabelText('Cantidad'), { target: { value: '1e306' } });
    }).not.toThrow();
    expect(componentRow(4)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar componentes' })).toBeInTheDocument();
  });
  it('ADV-008-05: la suma no debería mostrarse en notación exponencial', async () => {
    await renderCombo();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar componente' }));
    const row = componentRow(4);
    fireEvent.change(within(row).getByRole('combobox', { name: 'Producto' }), {
      target: { value: '3' },
    });
    expect(
      await screen.findByText('Los componentes por separado suman S/ 49.00.'),
    ).toBeVisible();
    // 1400 × 1e21 = 1.4e24 céntimos: String() cambia a '1.4e+22' → 'S/ 1.4e+22.04'.
    fireEvent.change(within(row).getByLabelText('Cantidad'), { target: { value: '1e21' } });
    const suma = await screen.findByText(/Los componentes por separado suman/);
    expect(suma.textContent).toMatch(/suman S\/ \d+\.\d{2}\./);
  });
  it('ADV-008-06: una fila de pollo sin presentación no debería sumar (D-008-09)', async () => {
    await renderCombo();
    // 1700 (¼ pierna) + 1400 + 400 = 3500 → 'S/ 35.00'.
    expect(
      await screen.findByText('Los componentes por separado suman S/ 35.00.'),
    ).toBeVisible();
    const row = componentRow(1);
    fireEvent.change(within(row).getByRole('combobox', { name: 'Presentación' }), {
      target: { value: '' },
    });
    // La fila incompleta no debería contar: la suma correcta sería 1400 + 400.
    expect(
      await screen.findByText('Los componentes por separado suman S/ 18.00.'),
    ).toBeVisible();
  });
  it('ADV-008-06: una cantidad que el PUT rechazaría (>99) no debería sumar', async () => {
    await renderCombo();
    expect(
      await screen.findByText('Los componentes por separado suman S/ 35.00.'),
    ).toBeVisible();
    fireEvent.change(within(componentRow(1)).getByLabelText('Cantidad'), {
      target: { value: '150' },
    });
    // La fila no se puede guardar (schema max 99) pero igual suma ×150.
    expect(
      await screen.findByText('Los componentes por separado suman S/ 18.00.'),
    ).toBeVisible();
  });
});

describe('ADV-008-07/08: validación local del cuerpo y errores por fila', () => {
  beforeEach(() => {
    mocks.params.id = '2';
    mockBase();
  });
  it('ADV-008-07: componentes duplicados se rechazan ANTES de salir a la red (D-008-12)', async () => {
    server.use(http.get('*/api/products/2/items', () => HttpResponse.json({ items: [] })));
    const calls: unknown[] = [];
    server.use(
      http.put('*/api/products/2/items', async ({ request }) => {
        calls.push(await request.json());
        return HttpResponse.json({ items: [] });
      }),
    );
    await renderCombo();
    for (const index of [1, 2]) {
      fireEvent.click(screen.getByRole('button', { name: 'Agregar componente' }));
      fireEvent.change(within(componentRow(index)).getByRole('combobox', { name: 'Producto' }), {
        target: { value: '4' },
      });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Guardar componentes' }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    // replaceComboItemsRequestSchema.superRefine detecta el duplicado en local:
    // debería verse el issue de raíz y NO enviarse ningún PUT.
    expect(screen.getByRole('alert')).toHaveTextContent('Hay componentes repetidos en la lista.');
    expect(calls).toHaveLength(0);
  });
  it('ADV-008-08: un error por fila no debería caer sobre otra fila tras Quitar', async () => {
    server.use(
      http.put('*/api/products/2/items', () =>
        HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Los datos enviados no son válidos.',
              details: {
                issues: [{ path: 'items.1.productId', message: 'Ese producto no existe.' }],
              },
            },
          },
          { status: 400 },
        ),
      ),
    );
    await renderCombo();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar componentes' }));
    // items.1 cae sobre Componente 2 (el chaufa), que es quien "no existe".
    expect(await within(componentRow(2)).findByText('Ese producto no existe.')).toBeVisible();
    fireEvent.click(within(componentRow(1)).getByRole('button', { name: 'Quitar' }));
    // El chaufa pasa a ser Componente 1: el mensaje debería seguir con su fila.
    expect(within(componentRow(1)).getByText('Ese producto no existe.')).toBeVisible();
  });
});

describe('ADV-008-09 a 11: doble clic no duplica mutaciones', () => {
  beforeEach(() => {
    mockBase();
  });
  it('ADV-008-09: doble clic en Guardar componentes envía un solo PUT', async () => {
    const { gate, release } = barrier();
    const calls: unknown[] = [];
    server.use(
      http.put('*/api/products/2/items', async ({ request }) => {
        calls.push(await request.json());
        await gate;
        return HttpResponse.json(ITEMS_LOADED);
      }),
    );
    await renderCombo();
    const save = screen.getByRole('button', { name: 'Guardar componentes' });
    act(() => {
      fireEvent.click(save);
      fireEvent.click(save);
    });
    release();
    await screen.findByText('Componentes guardados.');
    expect(calls).toHaveLength(1);
  });
  it('ADV-008-10: doble clic en Guardar presentaciones envía un solo PUT', async () => {
    const { gate, release } = barrier();
    const calls: unknown[] = [];
    server.use(
      http.put('*/api/products/1/portions', async ({ request }) => {
        calls.push(await request.json());
        await gate;
        return HttpResponse.json(POLLO_PORTIONS);
      }),
    );
    await renderChicken();
    const save = screen.getByRole('button', { name: 'Guardar presentaciones' });
    act(() => {
      fireEvent.click(save);
      fireEvent.click(save);
    });
    release();
    await screen.findByText('Presentaciones guardadas.');
    expect(calls).toHaveLength(1);
  });
  it('ADV-008-11: doble clic en Sí, desactivar envía un solo PATCH (lista y edición)', async () => {
    const calls: unknown[] = [];
    server.use(
      http.patch('*/api/products/:productId', async ({ request }) => {
        calls.push(await request.json());
        return HttpResponse.json({ ...POLLO, isActive: false });
      }),
    );
    // Lista.
    const viewList = show(<CartaPage />);
    expect(await screen.findByRole('heading', { name: 'Carta', level: 1 })).toBeVisible();
    const rowList = productRow('E2E Pollo');
    fireEvent.click(within(rowList).getByRole('button', { name: 'Desactivar' }));
    const confirmList = screen.getByRole('button', { name: 'Sí, desactivar' });
    act(() => {
      fireEvent.click(confirmList);
      fireEvent.click(confirmList);
    });
    await waitFor(() => expect(calls).toHaveLength(1));
    viewList.unmount();
    // Edición: mismo control montado en la otra pantalla.
    const viewEdit = await renderChicken();
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
    const confirmEdit = screen.getByRole('button', { name: 'Sí, desactivar' });
    act(() => {
      fireEvent.click(confirmEdit);
      fireEvent.click(confirmEdit);
    });
    await waitFor(() => expect(calls).toHaveLength(2));
    viewEdit.unmount();
  });
});

describe('ADV-008-12 a 14/16/26: red hostil — sesión, cuerpos e índices', () => {
  beforeEach(() => {
    mockBase();
  });
  it('ADV-008-12: un 401 en cualquier mutación de la carta cierra a /login', async () => {
    // PUT portions.
    server.use(
      http.put('*/api/products/1/portions', () =>
        HttpResponse.json(UNAUTHENTICATED, { status: 401 }),
      ),
    );
    let view = await renderChicken();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar presentaciones' }));
    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith('/login'));
    view.unmount();
    // PUT items.
    vi.clearAllMocks();
    server.use(
      http.put('*/api/products/2/items', () =>
        HttpResponse.json(UNAUTHENTICATED, { status: 401 }),
      ),
    );
    view = await renderCombo();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar componentes' }));
    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith('/login'));
    view.unmount();
    // PATCH datos.
    vi.clearAllMocks();
    mocks.params.id = '3';
    server.use(
      http.patch('*/api/products/3', () => HttpResponse.json(UNAUTHENTICATED, { status: 401 })),
    );
    view = show(<EditPage />);
    expect(await screen.findByLabelText('Nombre del producto')).toHaveValue('E2E Chaufa');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith('/login'));
    view.unmount();
    // POST alta.
    vi.clearAllMocks();
    server.use(
      http.post('*/api/products', () => HttpResponse.json(UNAUTHENTICATED, { status: 401 })),
    );
    view = show(<NuevoPage />);
    expect(
      await screen.findByRole('heading', { name: 'Agregar producto', level: 1 }),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText('Nombre del producto'), {
      target: { value: 'Rocoto' },
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Platos' }));
    fireEvent.change(screen.getByLabelText('Precio'), { target: { value: '12.00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));
    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith('/login'));
    view.unmount();
  });
  it('ADV-008-13: un 200/201 con cuerpo inválido o no-JSON se reporta como inesperado', async () => {
    // PUT portions → HTML.
    server.use(
      http.put(
        '*/api/products/1/portions',
        () =>
          new HttpResponse('<html><body>proxy</body></html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          }),
      ),
    );
    let view = await renderChicken();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar presentaciones' }));
    expect(
      await screen.findByText('Respuesta inesperada del servidor. Intenta nuevamente.'),
    ).toBeVisible();
    view.unmount();
    // PUT items → JSON válido con forma distinta.
    server.use(http.put('*/api/products/2/items', () => HttpResponse.json({ items: 'x' })));
    view = await renderCombo();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar componentes' }));
    expect(
      await screen.findByText('Respuesta inesperada del servidor. Intenta nuevamente.'),
    ).toBeVisible();
    view.unmount();
    // PATCH datos → 200 con cuerpo que no es Product.
    server.use(http.patch('*/api/products/3', () => HttpResponse.json({ ok: true })));
    mocks.params.id = '3';
    view = show(<EditPage />);
    expect(await screen.findByLabelText('Nombre del producto')).toHaveValue('E2E Chaufa');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(
      await screen.findByText('Respuesta inesperada del servidor. Intenta nuevamente.'),
    ).toBeVisible();
    view.unmount();
    // POST → 201 con cuerpo que no es Product: los campos conservan lo escrito.
    server.use(http.post('*/api/products', () => HttpResponse.json({ id: 'abc' }, { status: 201 })));
    view = show(<NuevoPage />);
    expect(
      await screen.findByRole('heading', { name: 'Agregar producto', level: 1 }),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText('Nombre del producto'), {
      target: { value: 'Rocoto' },
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Platos' }));
    fireEvent.change(screen.getByLabelText('Precio'), { target: { value: '12.00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));
    expect(
      await screen.findByText('Respuesta inesperada del servidor. Intenta nuevamente.'),
    ).toBeVisible();
    expect(screen.getByLabelText('Nombre del producto')).toHaveValue('Rocoto');
    view.unmount();
  });
});

describe('ADV-008-14/16/26: índices fuera de rango, timeout y wiring', () => {
  beforeEach(() => {
    mockBase();
  });
  it('ADV-008-14: un issue de fila con índice fuera del envío cae en la sección', async () => {
    // Porciones: se envían 3 filas (índices 0-2) pero el issue apunta a la 5.
    server.use(
      http.put('*/api/products/1/portions', () =>
        HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Los datos enviados no son válidos.',
              details: {
                issues: [{ path: 'portions.4.priceCents', message: 'Precio de la fila 5.' }],
              },
            },
          },
          { status: 400 },
        ),
      ),
    );
    let view = await renderChicken();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar presentaciones' }));
    expect(await screen.findByText('Precio de la fila 5.')).toBeVisible();
    for (const label of ['Octavo — pecho', 'Cuarto — pecho', 'Pollo entero']) {
      expect(within(portionRow(label)).queryByText('Precio de la fila 5.')).toBeNull();
    }
    view.unmount();
    // Componentes: se envían 3 filas y el issue apunta a la 10.
    server.use(
      http.put('*/api/products/2/items', () =>
        HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Los datos enviados no son válidos.',
              details: {
                issues: [{ path: 'items.9.quantity', message: 'Cantidad de la fila 10.' }],
              },
            },
          },
          { status: 400 },
        ),
      ),
    );
    mocks.params.id = '2';
    view = await renderCombo();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar componentes' }));
    expect(await screen.findByText('Cantidad de la fila 10.')).toBeVisible();
    expect(within(componentRow(1)).queryByText('Cantidad de la fila 10.')).toBeNull();
    view.unmount();
  });
  it('ADV-008-16: un PUT que excede el timeout se reporta como NETWORK_ERROR', async () => {
    server.use(
      http.put('*/api/products/3/portions', async () => {
        await delay(250);
        return HttpResponse.json({ portions: [] });
      }),
    );
    const onUnauthenticated = vi.fn();
    const client = createApiClient({ onUnauthenticated, timeoutMs: 40 });
    await expect(
      client.request('/products/3/portions', { method: 'PUT', body: { portions: [] } }),
    ).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });
  it('ADV-008-26: una solicitud sin manejador MSW falla (verifica onUnhandledFrame)', async () => {
    // La opción real de MSW 3.0.2 es onUnhandledFrame (no onUnhandledRequest):
    // este test deja constancia de que el cableado efectivamente tira la red.
    await expect(fetch(`${window.location.origin}/api/ruta-sin-manejador`)).rejects.toThrow();
  });
});

describe('ADV-008-15: mapeo de issues (lib/api/issues.ts)', () => {
  const issue = (path: string, message = 'msg') => ({ path, message });
  it.each([
    ['items', 'items.0.productId', 0],
    ['items', 'items.9.quantity', 9],
    ['items', 'items.01.cut', 1],
    ['items', 'items.1.productId.extra', 1],
    ['portions', 'portions.2.priceCents', 2],
  ])('splitIssues(%s, %j) lo lleva a la fila %i', (collection, path, expected) => {
    const result = splitIssues([issue(path)], collection as 'items' | 'portions');
    expect(result.byIndex.get(expected)).toEqual(['msg']);
    expect(result.root).toEqual([]);
  });
  it.each([
    ['items', 'items.0'],
    ['items', 'items.-1.productId'],
    ['items', 'Items.1.productId'],
    ['items', 'itemsx.1.productId'],
    ['items', 'items.1'],
    ['items', 'items.1.'],
    ['items', 'portions.1.priceCents'],
    ['portions', 'items.1.priceCents'],
    ['portions', 'portions'],
    ['items', ''],
  ])('splitIssues(%s, %j) cae en la sección', (collection, path) => {
    const result = splitIssues([issue(path)], collection as 'items' | 'portions');
    expect(result.byIndex.size).toBe(0);
    expect(result.root).toEqual(['msg']);
  });
  it('issuesFromApiError ignora errores no VALIDATION_ERROR y filtra issues malformados', () => {
    expect(issuesFromApiError(new Error('x'))).toEqual([]);
    expect(issuesFromApiError(new ApiError(409, 'PRODUCT_NAME_TAKEN', 'm', null))).toEqual([]);
    expect(
      issuesFromApiError(
        new ApiError(400, 'VALIDATION_ERROR', 'm', { issues: 'x' }),
      ),
    ).toEqual([]);
    expect(
      issuesFromApiError(
        new ApiError(400, 'VALIDATION_ERROR', 'm', {
          issues: [
            { path: 'items.0.a', message: 'válido' },
            { path: 3, message: 'sin path' },
            { message: 'sin path' },
            { path: 'items.1.b' },
          ],
        }),
      ),
    ).toEqual([{ path: 'items.0.a', message: 'válido' }]);
  });
  it('sectionMessages: sin issues por fila cae el apiErrorMessage (o el genérico) en root', () => {
    // Ojo: sectionMessages está exportada pero ningún componente la usa (las
    // secciones replican su lógica en línea) — se documenta igual el contrato.
    expect(
      sectionMessages(new ApiError(404, 'PRODUCT_NOT_FOUND', 'Ese producto no existe.', null), 'items')
        .root,
    ).toEqual(['Ese producto no existe.']);
    expect(
      sectionMessages(
        new ApiError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos.', {
          issues: 'x',
        }),
        'portions',
      ).root,
    ).toEqual(['Los datos enviados no son válidos.']);
    expect(sectionMessages('cualquier cosa', 'items').root).toEqual(['Revisa los datos.']);
  });
});

describe('ADV-008-17: RoleGuard en las tres rutas de la carta', () => {
  const pages: Array<() => ReactNode> = [
    () => <CartaPage />,
    () => <NuevoPage />,
    () => <EditPage />,
  ];
  it.each([
    [['waiter'], '/mozo'],
    [['kitchen'], '/cocina'],
    [['cashier'], '/caja'],
    [['waiter', 'cashier'], '/areas'],
  ])('roles %j son redirigidos a %s y no ven nada de la carta', async (roles, landing) => {
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({
          user: { id: 9, username: 'rol.test', displayName: 'X', roles },
          expiresAt: '2026-10-09T07:00:00.000Z',
        }),
      ),
      http.get('*/api/products', () => HttpResponse.json({ products: PRODUCTS })),
    );
    for (const page of pages) {
      mocks.params.id = '3';
      mocks.replace.mockClear();
      const view = show(page());
      await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(landing));
      expect(screen.queryByText(/Carta|Agregar producto|Editar producto/)).toBeNull();
      // No se guarda 'admin' como última área para usuarios que no pasan.
      expect(localStorage.getItem('lastArea')).not.toBe('admin');
      view.unmount();
    }
  });
  it('sin sesión (401) no muestra contenido en ninguna de las tres rutas', async () => {
    server.use(
      http.get('*/api/auth/me', () => HttpResponse.json(UNAUTHENTICATED, { status: 401 })),
      http.get('*/api/products', () => HttpResponse.json({ products: PRODUCTS })),
    );
    for (const page of pages) {
      mocks.params.id = '3';
      const view = show(page());
      await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith('/login'));
      expect(screen.queryByText(/Carta|Agregar producto|Editar producto/)).toBeNull();
      view.unmount();
    }
  });
});

describe('ADV-008-18: alias del id de ruta (Number(params.id))', () => {
  beforeEach(() => {
    mockBase();
  });
  it.each([
    ['0x1', true],
    ['1e0', true],
    ['+1', true],
    [' 1 ', true],
    ['1.0', true],
    ['01', true],
    ['abc', false],
    ['NaN', false],
    ['1.5', false],
    ['-1', false],
    ['Infinity', false],
    ['0', false],
    ['9007199254740993', false],
  ])('/admin/carta/%s %s', async (id, found) => {
    mocks.params.id = id;
    const view = show(<EditPage />);
    if (found) {
      // Mismo comportamiento documentado en usuarios (ADV-004-30).
      expect(await screen.findByLabelText('Nombre del producto')).toHaveValue('E2E Pollo');
    } else {
      expect(await screen.findByText('Ese producto no existe.')).toBeVisible();
    }
    view.unmount();
  });
});

describe('ADV-008-19/33: nombres y datos hostiles en la lista', () => {
  it.each([
    '<script>alert(1)</script>',
    '🐔 Pollo',
    'Pollo "doble"',
    'Pollo & Papas',
    'Pollo; DROP TABLE products',
    '\u202Eelpmaxe',
    '<img src=x onerror=alert(1)>',
  ])('ADV-008-19: nombre hostil %j se rechaza por esquema, nunca se renderiza', async (name) => {
    mockBase();
    server.use(
      http.get('*/api/products', () =>
        HttpResponse.json({
          products: [{ id: 9, name, category: 'dish', priceCents: 100, isActive: true }],
        }),
      ),
    );
    const view = show(<CartaPage />);
    // El esquema compartido valida cada producto: la lista falla limpia en vez
    // de renderizar texto que el API nunca debió aceptar.
    expect(await screen.findByText('No se pudo cargar la carta.')).toBeVisible();
    expect(screen.queryByText(name)).toBeNull();
    view.unmount();
  });
  it('ADV-008-19: un nombre válido pero tramposo se muestra como texto literal', async () => {
    mockBase();
    const tricky = "Pollo 'especial' 50% (familiar)";
    server.use(
      http.get('*/api/products', () =>
        HttpResponse.json({
          products: [{ id: 9, name: tricky, category: 'dish', priceCents: 100, isActive: true }],
        }),
      ),
    );
    const view = show(<CartaPage />);
    expect(await screen.findByText(tricky)).toBeVisible();
    view.unmount();
  });
  it('ADV-008-33: un priceCents fuera del rango del esquema tira la lista entera', async () => {
    mockBase();
    server.use(
      http.get('*/api/products', () =>
        HttpResponse.json({
          products: [
            { id: 9, name: 'Chaufa', category: 'dish', priceCents: 9999999999, isActive: true },
          ],
        }),
      ),
    );
    const view = show(<CartaPage />);
    expect(await screen.findByText('No se pudo cargar la carta.')).toBeVisible();
    view.unmount();
  });
});

describe('ADV-008-20/21/23/24/25: estado local y grilla de porciones', () => {
  beforeEach(() => {
    mockBase();
  });
  it('ADV-008-20: una lista más fresca gana a la respuesta del PATCH (overlay saved)', async () => {
    mocks.params.id = '3';
    const latest = PRODUCTS.map((p) => (p.id === 3 ? { ...p, name: 'Chaufa Otra' } : p));
    let listCalls = 0;
    server.use(
      http.get('*/api/products', () => {
        listCalls += 1;
        return HttpResponse.json({ products: listCalls === 1 ? PRODUCTS : latest });
      }),
      http.patch('*/api/products/3', () => HttpResponse.json({ ...CHAUFA, name: 'Chaufa Editada' })),
    );
    const view = show(<EditPage />);
    expect(await screen.findByLabelText('Nombre del producto')).toHaveValue('E2E Chaufa');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await screen.findByText('Cambios guardados.');
    await waitFor(() => expect(listCalls).toBeGreaterThanOrEqual(2));
    // La lista refrescada es más nueva que el overlay del PATCH: gana la lista.
    expect(screen.getByLabelText('Nombre del producto')).toHaveValue('Chaufa Otra');
    view.unmount();
  });
  it('ADV-008-21: issues portions.N caen sobre la fila N del envío, no de la grilla', async () => {
    await renderChicken({ portions: [] });
    // Se marcan las filas 2, 5 y 6 de la grilla → el envío tiene 3 porciones.
    const targets: Array<[string, string]> = [
      ['Octavo — pierna', '10'],
      ['Medio pollo', '40'],
      ['Pollo entero', '60'],
    ];
    for (const [label, price] of targets) {
      const row = portionRow(label);
      fireEvent.click(within(row).getByRole('checkbox', { name: label }));
      fireEvent.change(within(row).getByLabelText(`Precio de ${label}`), {
        target: { value: price },
      });
    }
    server.use(
      http.put('*/api/products/1/portions', () =>
        HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Los datos enviados no son válidos.',
              details: {
                issues: [{ path: 'portions.1.priceCents', message: 'Precio del envío 2.' }],
              },
            },
          },
          { status: 400 },
        ),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Guardar presentaciones' }));
    // 'portions.1' del envío corresponde a 'Medio pollo', no a 'Octavo — pierna'.
    expect(
      await within(portionRow('Medio pollo')).findByText('Precio del envío 2.'),
    ).toBeVisible();
    expect(within(portionRow('Octavo — pierna')).queryByText('Precio del envío 2.')).toBeNull();
  });
  it('ADV-008-23: la grilla acepta los bordes 0 y 999.99 y envía sus céntimos exactos', async () => {
    await renderChicken({ portions: [] });
    const calls: Array<{ portions: Array<{ portion: string; priceCents: number }> }> = [];
    server.use(
      http.put('*/api/products/1/portions', async ({ request }) => {
        const body = (await request.json()) as { portions: Array<{ portion: string; cut: string | null; priceCents: number }> };
        calls.push(body);
        // El PUT devuelve lo enviado: la fila sigue marcada para el segundo intento.
        return HttpResponse.json({
          portions: body.portions.map((p, index) => ({ id: index + 1, productId: 1, ...p })),
        });
      }),
    );
    const row = portionRow('Medio pollo');
    fireEvent.click(within(row).getByRole('checkbox', { name: 'Medio pollo' }));
    fireEvent.change(within(row).getByLabelText('Precio de Medio pollo'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar presentaciones' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.portions[0]).toEqual({ portion: 'half', cut: null, priceCents: 0 });
    fireEvent.change(within(row).getByLabelText('Precio de Medio pollo'), {
      target: { value: '999.99' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar presentaciones' }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.portions[0]).toEqual({ portion: 'half', cut: null, priceCents: 99999 });
  });
  it('ADV-008-24: un GET de porciones malformado muestra error y Reintentar recupera', async () => {
    let attempt = 0;
    server.use(
      http.get('*/api/products/1/portions', () => {
        attempt += 1;
        return attempt === 1
          ? HttpResponse.json({
              portions: [{ id: 1, productId: 1, portion: 'fifth', cut: null, priceCents: 1 }],
            })
          : HttpResponse.json(POLLO_PORTIONS);
      }),
    );
    mocks.params.id = '1';
    const view = show(<EditPage />);
    expect(
      await screen.findByRole('heading', { name: 'Presentaciones del pollo', level: 2 }),
    ).toBeVisible();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Respuesta inesperada del servidor. Intenta nuevamente.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('checkbox', { name: 'Pollo entero' })).toBeChecked();
    view.unmount();
  });
  it('ADV-008-25: si el GET de porciones del componente falla, la comparación cae al precio base en silencio', async () => {
    mocks.params.id = '2';
    server.use(http.get('*/api/products/1/portions', () => HttpResponse.error()));
    await renderCombo();
    // Documenta la degradación: con el ¼ pierna inaccesible suma el fallback
    // priceCents 6500 → 6500+1400+400 = 8300, sin ningún indicio de que el dato
    // de porciones no pudo consultarse (spec silenciosa sobre este caso).
    expect(
      await screen.findByText('Los componentes por separado suman S/ 83.00.'),
    ).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('ADV-008-27 a 30: entradas numéricas alternativas y controles', () => {
  beforeEach(() => {
    mocks.params.id = '2';
    mockBase();
    server.use(http.get('*/api/products/2/items', () => HttpResponse.json({ items: [] })));
  });
  it.each([
    ['0x10', 16],
    ['1e1', 10],
    [' 3 ', 3],
    ['3.0', 3],
    ['003', 3],
  ])(
    'ADV-008-27: cantidad %j se interpreta como %i (Number() en vez de entero estricto)',
    async (text, expected) => {
      const calls: Array<{ items: Array<{ quantity: number }> }> = [];
      server.use(
        http.put('*/api/products/2/items', async ({ request }) => {
          calls.push((await request.json()) as { items: Array<{ quantity: number }> });
          return HttpResponse.json({ items: [] });
        }),
      );
      const view = await renderCombo();
      fireEvent.click(screen.getByRole('button', { name: 'Agregar componente' }));
      const row = componentRow(1);
      fireEvent.change(within(row).getByRole('combobox', { name: 'Producto' }), {
        target: { value: '3' },
      });
      fireEvent.change(within(row).getByLabelText('Cantidad'), { target: { value: text } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar componentes' }));
      await waitFor(() => expect(calls).toHaveLength(1));
      expect(calls[0]?.items[0]?.quantity).toBe(expected);
      view.unmount();
    },
  );
  it('ADV-008-28: Quitar rehabilita Agregar componente tras llegar a 10 filas', async () => {
    mocks.params.id = '2';
    const ten = Array.from({ length: 10 }, (_, index) => ({
      id: 100 + index,
      comboId: 2,
      product: {
        id: 30 + index,
        name: `P${index}`,
        category: 'dish',
        priceCents: 100,
        isActive: true,
      },
      quantity: 1,
      portion: null,
      cut: null,
    }));
    const extraProducts = ten.map((item) => item.product);
    server.use(
      http.get('*/api/products', () =>
        HttpResponse.json({ products: [...PRODUCTS, ...extraProducts] }),
      ),
      http.get('*/api/products/2/items', () => HttpResponse.json({ items: ten })),
    );
    await renderCombo();
    const add = screen.getByRole('button', { name: 'Agregar componente' });
    expect(add).toBeDisabled();
    fireEvent.click(within(componentRow(1)).getByRole('button', { name: 'Quitar' }));
    expect(add).toBeEnabled();
  });
  it('ADV-008-29: doble clic en Crear producto no duplica el POST', async () => {
    const { gate, release } = barrier();
    const calls: unknown[] = [];
    server.use(
      http.post('*/api/products', async ({ request }) => {
        calls.push(await request.json());
        await gate;
        return HttpResponse.json(
          { id: 10, name: 'Rocoto', category: 'dish', priceCents: 1200, isActive: true },
          { status: 201 },
        );
      }),
    );
    const view = show(<NuevoPage />);
    expect(
      await screen.findByRole('heading', { name: 'Agregar producto', level: 1 }),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText('Nombre del producto'), {
      target: { value: 'Rocoto' },
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Platos' }));
    fireEvent.change(screen.getByLabelText('Precio'), { target: { value: '12.00' } });
    const create = screen.getByRole('button', { name: 'Crear producto' });
    act(() => {
      fireEvent.click(create);
      fireEvent.click(create);
    });
    release();
    await waitFor(() => expect(calls).toHaveLength(1));
    view.unmount();
  });
  it('ADV-008-30: un PATCH de estado malformado no altera la fila ni marca éxito', async () => {
    mocks.params.id = '1';
    server.use(http.patch('*/api/products/1', () => HttpResponse.json({ ok: true })));
    const view = show(<CartaPage />);
    expect(await screen.findByRole('heading', { name: 'Carta', level: 1 })).toBeVisible();
    const row = productRow('E2E Pollo');
    fireEvent.click(within(row).getByRole('button', { name: 'Desactivar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, desactivar' }));
    expect(
      await screen.findByText('Respuesta inesperada del servidor. Intenta nuevamente.'),
    ).toBeVisible();
    expect(within(row).getByRole('button', { name: 'Desactivar' })).toBeInTheDocument();
    view.unmount();
  });
});
