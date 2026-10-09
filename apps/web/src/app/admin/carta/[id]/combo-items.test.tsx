import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../../../tests/msw-server.ts';
import EditPage from './page.tsx';

const mocks = vi.hoisted(() => ({ replace: vi.fn(), params: { id: '2' } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useParams: () => mocks.params,
}));
vi.mock('../../../../lib/navigation.ts', () => ({ hardNavigate: vi.fn() }));

const SESSION_ADMIN = {
  user: { id: 1, username: 'dueno', displayName: 'Carlos', roles: ['admin'] },
  expiresAt: '2026-10-09T07:00:00.000Z',
};
const POLLO = { id: 1, name: 'E2E Pollo', category: 'chicken', priceCents: 6500, isActive: true };
const COMBO = { id: 2, name: 'Mostrito', category: 'combo', priceCents: 3000, isActive: true };
const OTRO_COMBO = {
  id: 5,
  name: 'Combo d\u00FAo',
  category: 'combo',
  priceCents: 2500,
  isActive: true,
};
const CHAUFA = { id: 3, name: 'E2E Chaufa', category: 'dish', priceCents: 1400, isActive: true };
const GASEOSA = { id: 4, name: 'E2E Gaseosa', category: 'drink', priceCents: 400, isActive: true };
const POSTRE = {
  id: 6,
  name: 'Tres Leches',
  category: 'dessert',
  priceCents: 500,
  isActive: false,
};
const AJI = { id: 7, name: 'Aj\u00ED', category: 'sauce', priceCents: 0, isActive: true };
const PRODUCTS = [POLLO, COMBO, OTRO_COMBO, CHAUFA, GASEOSA, POSTRE, AJI];
const ITEMS_LOADED = {
  items: [
    { id: 21, comboId: 2, product: POLLO, quantity: 1, portion: 'quarter', cut: 'leg' },
    { id: 22, comboId: 2, product: CHAUFA, quantity: 1, portion: null, cut: null },
    { id: 23, comboId: 2, product: GASEOSA, quantity: 1, portion: null, cut: null },
  ],
};
const POLLO_PORTIONS = {
  portions: [
    { id: 11, productId: 1, portion: 'quarter', cut: 'breast', priceCents: 1800 },
    { id: 12, productId: 1, portion: 'quarter', cut: 'leg', priceCents: 1700 },
    { id: 13, productId: 1, portion: 'whole', cut: null, priceCents: 6500 },
  ],
};
const NETWORK = 'Sin conexi\u00F3n con el servidor. Revisa el wifi e intenta de nuevo.';
const NOTA_CATEGORIA =
  'Mientras tenga componentes cargados, la categor\u00EDa del producto no se puede cambiar.';
const NOTA_SUMA =
  'La suma usa el precio de venta suelto de cada componente; si el pollo no vende suelta esa presentaci\u00F3n, se usa el precio base del producto.';

function show(node: ReactNode, client?: QueryClient) {
  const queryClient =
    client ?? new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}
// MSW 3 evalúa los handlers en el orden en que quedan registrados y gana el PRIMERO
// que coincide con la petición. Dentro de un mismo server.use el orden es el de los
// argumentos, así que los específicos de los productos 1 y 2 van antes que los
// comodines :productId, que de lo contrario los taparían con respuestas vacías.
function mockBase(products: unknown[] = PRODUCTS, items: typeof ITEMS_LOADED = ITEMS_LOADED) {
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json(SESSION_ADMIN)),
    http.get('*/api/products/1/portions', () => HttpResponse.json(POLLO_PORTIONS)),
    http.get('*/api/products/2/items', () => HttpResponse.json(items)),
    http.get('*/api/products', () => HttpResponse.json({ products })),
    http.get('*/api/products/:productId/items', () => HttpResponse.json({ items: [] })),
    http.get('*/api/products/:productId/portions', () => HttpResponse.json({ portions: [] })),
  );
}
/** Editor de componentes cargado para el combo 2. */
async function renderCombo(
  products?: unknown[],
  items?: typeof ITEMS_LOADED,
  client?: QueryClient,
) {
  if (products !== undefined || items !== undefined) mockBase(products, items ?? ITEMS_LOADED);
  const view = show(<EditPage />, client);
  expect(
    await screen.findByRole('heading', { name: 'Componentes del combo', level: 2 }),
  ).toBeVisible();
  return view;
}
function componentRow(index: number): HTMLElement {
  const group = screen.getByRole('group', { name: `Componente ${index}` });
  return group;
}

describe('008: componentes del combo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/admin/carta/2');
    mocks.params.id = '2';
    mockBase();
  });

  it('AC-14: la sección solo aparece cuando la categoría guardada es combo', async () => {
    const view = await renderCombo();
    view.unmount();
    mocks.params.id = '3';
    show(<EditPage />);
    expect(await screen.findByRole('heading', { name: 'Editar producto', level: 1 })).toBeVisible();
    await waitFor(() => {
      expect(screen.getByLabelText('Nombre del producto')).toHaveValue('E2E Chaufa');
    });
    expect(
      screen.queryByRole('heading', { name: 'Componentes del combo' }),
    ).not.toBeInTheDocument();
  });

  it('AC-14: las filas llegan pobladas desde GET /items y se pueden quitar y agregar', async () => {
    await renderCombo();
    expect(screen.getByText(NOTA_CATEGORIA)).toBeVisible();
    const row1 = componentRow(1);
    expect(within(row1).getByRole('combobox', { name: 'Producto' })).toHaveValue('1');
    expect(within(row1).getByLabelText('Cantidad')).toHaveValue('1');
    expect(within(row1).getByRole('combobox', { name: 'Presentaci\u00F3n' })).toHaveValue(
      'quarter',
    );
    expect(within(row1).getByRole('combobox', { name: 'Parte' })).toHaveValue('leg');
    const row2 = componentRow(2);
    expect(within(row2).getByRole('combobox', { name: 'Producto' })).toHaveValue('3');
    expect(within(row2).getByLabelText('Cantidad')).toHaveValue('1');
    expect(
      within(row2).queryByRole('combobox', { name: 'Presentaci\u00F3n' }),
    ).not.toBeInTheDocument();
    // 'Quitar' borra la fila y las siguientes se renumeran.
    fireEvent.click(within(row2).getByRole('button', { name: 'Quitar' }));
    expect(screen.queryByRole('group', { name: 'Componente 3' })).not.toBeInTheDocument();
    expect(within(componentRow(2)).getByRole('combobox', { name: 'Producto' })).toHaveValue('4');
    // 'Agregar componente' añade una fila vacía al final.
    fireEvent.click(screen.getByRole('button', { name: 'Agregar componente' }));
    const row3 = componentRow(3);
    expect(within(row3).getByRole('combobox', { name: 'Producto' })).toHaveValue('');
    expect(within(row3).getByLabelText('Cantidad')).toBeInTheDocument();
  });

  it('AC-14: guardar envía el PUT con nulls correctos, muestra el aviso e invalida', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const calls: unknown[] = [];
    server.use(
      http.put('*/api/products/2/items', async ({ request }) => {
        calls.push(await request.json());
        return HttpResponse.json(ITEMS_LOADED);
      }),
    );
    // El render usa el mismo QueryClient espiado para comprobar la invalidación.
    await renderCombo(undefined, undefined, client);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar componentes' }));
    expect(await screen.findByText('Componentes guardados.')).toBeVisible();
    expect(calls).toEqual([
      {
        items: [
          { productId: 1, quantity: 1, portion: 'quarter', cut: 'leg' },
          { productId: 3, quantity: 1, portion: null, cut: null },
          { productId: 4, quantity: 1, portion: null, cut: null },
        ],
      },
    ]);
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['admin', 'products'] }),
    );
  });

  it('AC-14: sin filas el guardar envía { items: [] } y la sección muestra su estado vacío', async () => {
    const calls: unknown[] = [];
    server.use(
      http.put('*/api/products/2/items', async ({ request }) => {
        calls.push(await request.json());
        return HttpResponse.json({ items: [] });
      }),
    );
    await renderCombo(undefined, { items: [] });
    expect(screen.getByText('Este combo todav\u00EDa no tiene componentes.')).toBeVisible();
    expect(
      screen.getByText('Un combo sin componentes se vende como un producto simple.'),
    ).toBeVisible();
    expect(screen.getByText(NOTA_CATEGORIA)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar componentes' }));
    await waitFor(() => {
      expect(calls).toEqual([{ items: [] }]);
    });
  });

  it('AC-15: el selector Producto no ofrece combos y marca a los inactivos', async () => {
    await renderCombo();
    const select = within(componentRow(1)).getByRole('combobox', { name: 'Producto' });
    const options = Array.from(select.querySelectorAll('option'));
    const optionTexts = options.map((option) => option.textContent);
    // Ni el propio combo ni otros combos son candidatos (RN-007-04, por construcción).
    expect(optionTexts).not.toContain('Mostrito');
    expect(optionTexts).not.toContain('Combo d\u00FAo');
    expect(optionTexts[0]).toBe('Elige un producto');
    expect(optionTexts).toContain('E2E Pollo');
    expect(optionTexts).toContain('E2E Chaufa');
    expect(optionTexts).toContain('E2E Gaseosa');
    expect(optionTexts).toContain('Tres Leches (desactivado)');
    expect(optionTexts).toContain('Aj\u00ED');
    // Los candidatos van agrupados por categoría en el orden de la carta.
    const optgroups = Array.from(select.querySelectorAll('optgroup')).map(
      (optgroup) => optgroup.label,
    );
    expect(optgroups).toEqual(['Pollo', 'Platos', 'Bebidas', 'Postres', 'Cremas']);
  });

  it('AC-15: con un chicken aparecen Presentación y Parte con preselección cuarto/pierna', async () => {
    await renderCombo(undefined, { items: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar componente' }));
    const row = componentRow(1);
    fireEvent.change(within(row).getByRole('combobox', { name: 'Producto' }), {
      target: { value: '1' },
    });
    const portion = await within(row).findByRole('combobox', { name: 'Presentaci\u00F3n' });
    expect(
      Array.from(portion.querySelectorAll('option')).map((option) => option.textContent),
    ).toEqual(['Octavo', 'Cuarto', 'Medio pollo', 'Pollo entero']);
    expect(portion).toHaveValue('quarter');
    const cut = within(row).getByRole('combobox', { name: 'Parte' });
    expect(Array.from(cut.querySelectorAll('option')).map((option) => option.textContent)).toEqual([
      'Pecho',
      'Pierna',
    ]);
    expect(cut).toHaveValue('leg');
  });

  it('AC-15: al elegir Medio pollo o Pollo entero la Parte desaparece y viaja null', async () => {
    const calls: unknown[] = [];
    server.use(
      http.put('*/api/products/2/items', async ({ request }) => {
        calls.push(await request.json());
        return HttpResponse.json({ items: [] });
      }),
    );
    await renderCombo(undefined, { items: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar componente' }));
    const row = componentRow(1);
    fireEvent.change(within(row).getByRole('combobox', { name: 'Producto' }), {
      target: { value: '1' },
    });
    const portion = await within(row).findByRole('combobox', { name: 'Presentaci\u00F3n' });
    fireEvent.change(portion, { target: { value: 'whole' } });
    expect(within(row).queryByRole('combobox', { name: 'Parte' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar componentes' }));
    await waitFor(() => {
      expect(calls).toEqual([
        { items: [{ productId: 1, quantity: 1, portion: 'whole', cut: null }] },
      ]);
    });
  });

  it('AC-15: un componente que no es pollo viaja con presentación y parte null', async () => {
    const calls: unknown[] = [];
    server.use(
      http.put('*/api/products/2/items', async ({ request }) => {
        calls.push(await request.json());
        return HttpResponse.json({ items: [] });
      }),
    );
    await renderCombo(undefined, { items: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar componente' }));
    const row = componentRow(1);
    fireEvent.change(within(row).getByRole('combobox', { name: 'Producto' }), {
      target: { value: '3' },
    });
    expect(
      within(row).queryByRole('combobox', { name: 'Presentaci\u00F3n' }),
    ).not.toBeInTheDocument();
    expect(within(row).queryByRole('combobox', { name: 'Parte' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar componentes' }));
    await waitFor(() => {
      expect(calls).toEqual([{ items: [{ productId: 3, quantity: 1, portion: null, cut: null }] }]);
    });
  });

  it('AC-15: con diez filas el alta se deshabilita con su nota', async () => {
    const ten = {
      items: Array.from({ length: 10 }, (_, index) => ({
        id: 100 + index,
        comboId: 2,
        product: CHAUFA,
        quantity: 1,
        portion: null,
        cut: null,
      })),
    };
    await renderCombo(undefined, ten);
    expect(screen.getByRole('group', { name: 'Componente 10' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar componente' })).toBeDisabled();
    expect(screen.getByText('Un combo admite hasta 10 componentes.')).toBeVisible();
  });

  it('AC-16: la comparación muestra la suma por separado y el precio del combo', async () => {
    await renderCombo();
    expect(await screen.findByText('Los componentes por separado suman S/ 35.00.')).toBeVisible();
    expect(
      screen.getByText('El combo cuesta S/ 30.00 (S/ 5.00 menos que por separado).'),
    ).toBeVisible();
    expect(screen.getByText(NOTA_SUMA)).toBeVisible();
  });

  it.each([
    [4000, 'El combo cuesta S/ 40.00 (S/ 5.00 m\u00E1s que por separado).'],
    [3500, 'El combo cuesta S/ 35.00 (igual que por separado.)'],
  ])(
    'AC-16: con el combo a %i céntimos la comparación muestra "%s"',
    async (comboPrice, expected) => {
      const products = PRODUCTS.map((product) =>
        product.id === 2 ? { ...product, priceCents: comboPrice } : product,
      );
      await renderCombo(products);
      expect(await screen.findByText(expected)).toBeVisible();
    },
  );

  it('AC-16: una presentación que no se vende suelta usa el priceCents del producto', async () => {
    server.use(http.get('*/api/products/1/portions', () => HttpResponse.json({ portions: [] })));
    await renderCombo();
    // 6500 (base del pollo) + 1400 + 400 = 8300.
    expect(await screen.findByText('Los componentes por separado suman S/ 83.00.')).toBeVisible();
    expect(
      screen.getByText('El combo cuesta S/ 30.00 (S/ 53.00 menos que por separado).'),
    ).toBeVisible();
    expect(screen.getByText(NOTA_SUMA)).toBeVisible();
  });

  it('AC-16: una fila sin producto no suma y sin filas completas la comparación no aparece', async () => {
    const view = await renderCombo();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar componente' }));
    // La fila 4 vacía no cambia la suma.
    expect(await screen.findByText('Los componentes por separado suman S/ 35.00.')).toBeVisible();
    view.unmount();
    await renderCombo(undefined, { items: [] });
    expect(screen.queryByText(/Los componentes por separado suman/)).not.toBeInTheDocument();
  });

  it('AC-16: un componente desactivado suma igual con su precio actual', async () => {
    const products = PRODUCTS.map((product) =>
      product.id === 4 ? { ...product, isActive: false } : product,
    );
    const items = {
      items: [
        { id: 21, comboId: 2, product: POLLO, quantity: 1, portion: 'quarter', cut: 'leg' },
        { id: 22, comboId: 2, product: CHAUFA, quantity: 1, portion: null, cut: null },
        {
          id: 23,
          comboId: 2,
          product: { ...GASEOSA, isActive: false },
          quantity: 1,
          portion: null,
          cut: null,
        },
      ],
    };
    await renderCombo(products, items);
    expect(await screen.findByText('Los componentes por separado suman S/ 35.00.')).toBeVisible();
    expect(within(componentRow(3)).getByRole('combobox', { name: 'Producto' })).toHaveValue('4');
    expect(
      within(componentRow(3))
        .getByRole('combobox', { name: 'Producto' })
        .querySelector('option:checked'),
    ).toHaveTextContent('(desactivado)');
  });

  it('AC-17: una fila sin producto muestra "Elige el producto." y no envía', async () => {
    const calls = vi.fn();
    server.use(
      http.put('*/api/products/2/items', () => {
        calls();
        return HttpResponse.json(ITEMS_LOADED);
      }),
    );
    await renderCombo();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar componente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar componentes' }));
    expect(await within(componentRow(4)).findByText('Elige el producto.')).toBeVisible();
    expect(calls).not.toHaveBeenCalled();
  });

  it('AC-17: una fila de pollo sin presentación muestra su mensaje y no envía', async () => {
    const calls = vi.fn();
    server.use(
      http.put('*/api/products/2/items', () => {
        calls();
        return HttpResponse.json(ITEMS_LOADED);
      }),
    );
    await renderCombo(undefined, { items: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar componente' }));
    const row = componentRow(1);
    fireEvent.change(within(row).getByRole('combobox', { name: 'Producto' }), {
      target: { value: '1' },
    });
    const portion = await within(row).findByRole('combobox', { name: 'Presentaci\u00F3n' });
    fireEvent.change(portion, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar componentes' }));
    expect(await within(row).findByText('Elige la presentaci\u00F3n del pollo.')).toBeVisible();
    expect(calls).not.toHaveBeenCalled();
  });

  it('AC-17: una cantidad inválida muestra el mensaje del esquema junto a la fila', async () => {
    const calls = vi.fn();
    server.use(
      http.put('*/api/products/2/items', () => {
        calls();
        return HttpResponse.json(ITEMS_LOADED);
      }),
    );
    await renderCombo();
    const row = componentRow(2);
    fireEvent.change(within(row).getByLabelText('Cantidad'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar componentes' }));
    expect(
      await within(row).findByText('Indica cu\u00E1ntas unidades lleva este componente.'),
    ).toBeVisible();
    expect(calls).not.toHaveBeenCalled();
  });

  it('AC-17: los issues items.N del 400 van junto a su fila y los de raíz a la sección', async () => {
    server.use(
      http.put('*/api/products/2/items', () =>
        HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Los datos enviados no son v\u00E1lidos.',
              details: {
                issues: [
                  { path: 'items.1.productId', message: 'Ese producto no existe.' },
                  { path: 'items.0.portion', message: 'La presentaci\u00F3n no corresponde.' },
                  { path: 'items', message: 'Hay componentes repetidos en la lista.' },
                ],
              },
            },
          },
          { status: 400 },
        ),
      ),
    );
    await renderCombo();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar componentes' }));
    expect(await within(componentRow(2)).findByText('Ese producto no existe.')).toBeVisible();
    expect(
      await within(componentRow(1)).findByText('La presentaci\u00F3n no corresponde.'),
    ).toBeVisible();
    expect(await screen.findByText('Hay componentes repetidos en la lista.')).toBeVisible();
  });

  it.each([
    [
      409,
      'COMBO_ITEMS_NOT_ALLOWED',
      'Solo los productos de la categor\u00EDa Combos pueden tener componentes.',
    ],
    [404, 'PRODUCT_NOT_FOUND', 'Ese producto no existe.'],
  ])(
    'AC-17: el error %s %s del PUT se muestra tal cual y las filas quedan como estaban',
    async (status, code, message) => {
      server.use(
        http.put('*/api/products/2/items', () =>
          HttpResponse.json({ error: { code, message, details: null } }, { status }),
        ),
      );
      await renderCombo();
      fireEvent.click(screen.getByRole('button', { name: 'Guardar componentes' }));
      expect(await screen.findByText(message)).toBeVisible();
      expect(within(componentRow(1)).getByRole('combobox', { name: 'Producto' })).toHaveValue('1');
      expect(screen.getByRole('group', { name: 'Componente 3' })).toBeInTheDocument();
    },
  );

  it('AC-17: un error de red muestra su mensaje', async () => {
    server.use(http.put('*/api/products/2/items', () => HttpResponse.error()));
    await renderCombo();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar componentes' }));
    expect(await screen.findByText(NETWORK)).toBeVisible();
  });
});
