import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../../../tests/msw-server.ts';
import EditPage from './page.tsx';

const mocks = vi.hoisted(() => ({ replace: vi.fn(), params: { id: '1' } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useParams: () => mocks.params,
}));
vi.mock('../../../../lib/navigation.ts', () => ({ hardNavigate: vi.fn() }));

const SESSION_ADMIN = {
  user: { id: 1, username: 'dueno', displayName: 'Carlos', roles: ['admin'] },
  expiresAt: '2026-10-09T07:00:00.000Z',
};
const PRODUCTS = [
  { id: 1, name: 'Pollo a la brasa', category: 'chicken', priceCents: 6500, isActive: true },
  { id: 2, name: 'Mostrito', category: 'combo', priceCents: 3000, isActive: true },
  { id: 3, name: 'Chaufa', category: 'dish', priceCents: 1400, isActive: true },
];
const PORTIONS_LOADED = {
  portions: [
    { id: 11, productId: 1, portion: 'quarter', cut: 'breast', priceCents: 1850 },
    { id: 12, productId: 1, portion: 'whole', cut: null, priceCents: 6000 },
  ],
};
const PRICE_MESSAGE =
  'Escribe el precio en soles (por ejemplo 18.50). El m\u00E1ximo es S/ 999.99.';
const NETWORK = 'Sin conexi\u00F3n con el servidor. Revisa el wifi e intenta de nuevo.';
const ROW_LABELS = [
  'Octavo \u2014 pecho',
  'Octavo \u2014 pierna',
  'Cuarto \u2014 pecho',
  'Cuarto \u2014 pierna',
  'Medio pollo',
  'Pollo entero',
];

function show(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
function mockBase() {
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json(SESSION_ADMIN)),
    http.get('*/api/products', () => HttpResponse.json({ products: PRODUCTS })),
    http.get('*/api/products/:productId/items', () => HttpResponse.json({ items: [] })),
  );
}
/** Fila de la grilla: el ancestro del campo precio que también contiene su checkbox. */
function portionRow(label: string): HTMLElement {
  const input = screen.getByLabelText(`Precio de ${label}`);
  const checkbox = screen.getByRole('checkbox', { name: label });
  let element: HTMLElement | null = input;
  while (element !== null && !element.contains(checkbox)) element = element.parentElement;
  expect(element, `fila de ${label}`).not.toBeNull();
  return element as HTMLElement;
}
/** Sección 'Presentaciones del pollo' ya cargada para el producto 1. */
async function renderChicken(portions: typeof PORTIONS_LOADED = PORTIONS_LOADED) {
  server.use(http.get('*/api/products/1/portions', () => HttpResponse.json(portions)));
  const view = show(<EditPage />);
  expect(
    await screen.findByRole('heading', { name: 'Presentaciones del pollo', level: 2 }),
  ).toBeVisible();
  return view;
}

describe('008: grilla de presentaciones del pollo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/admin/carta/1');
    mocks.params.id = '1';
    mockBase();
  });

  it('AC-12: la sección solo aparece cuando la categoría guardada es chicken', async () => {
    const view = await renderChicken();
    view.unmount();
    mocks.params.id = '3';
    show(<EditPage />);
    expect(await screen.findByRole('heading', { name: 'Editar producto', level: 1 })).toBeVisible();
    await waitFor(() => {
      expect(screen.getByLabelText('Nombre del producto')).toHaveValue('Chaufa');
    });
    expect(
      screen.queryByRole('heading', { name: 'Presentaciones del pollo' }),
    ).not.toBeInTheDocument();
  });

  it('AC-12: las seis filas llegan en orden y precargadas desde GET /portions', async () => {
    await renderChicken();
    expect(
      screen.getByText(
        'Mientras tenga presentaciones cargadas, la categor\u00EDa del producto no se puede cambiar.',
      ),
    ).toBeVisible();
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(6);
    // Las seis filas en el orden fijo de la spec (posición de cada checkbox nombrado).
    const labels = ROW_LABELS.map((label) =>
      checkboxes.indexOf(screen.getByRole('checkbox', { name: label })),
    );
    expect(labels).toEqual([0, 1, 2, 3, 4, 5]);
    expect(screen.getByRole('checkbox', { name: 'Cuarto \u2014 pecho' })).toBeChecked();
    expect(screen.getByLabelText('Precio de Cuarto \u2014 pecho')).toHaveValue('18.50');
    expect(screen.getByLabelText('Precio de Cuarto \u2014 pecho')).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: 'Pollo entero' })).toBeChecked();
    expect(screen.getByLabelText('Precio de Pollo entero')).toHaveValue('60.00');
    for (const label of ROW_LABELS.filter(
      (name) => name !== 'Cuarto \u2014 pecho' && name !== 'Pollo entero',
    )) {
      expect(screen.getByRole('checkbox', { name: label })).not.toBeChecked();
      expect(screen.getByLabelText(`Precio de ${label}`)).toBeDisabled();
      expect(screen.getByLabelText(`Precio de ${label}`)).toHaveValue('');
    }
  });

  it('AC-12: guardar envía un solo PUT con las filas marcadas y muestra el aviso', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const calls: unknown[] = [];
    server.use(
      // El GET de /portions también hace falta: mockBase no lo registra y sin él la
      // sección queda en estado de error ('Reintentar') antes de poder guardar.
      http.get('*/api/products/1/portions', () => HttpResponse.json(PORTIONS_LOADED)),
      http.put('*/api/products/1/portions', async ({ request }) => {
        calls.push(await request.json());
        return HttpResponse.json({
          portions: [
            { id: 11, productId: 1, portion: 'quarter', cut: 'breast', priceCents: 1850 },
            { id: 13, productId: 1, portion: 'quarter', cut: 'leg', priceCents: 1890 },
            { id: 12, productId: 1, portion: 'whole', cut: null, priceCents: 6000 },
          ],
        });
      }),
    );
    render(
      <QueryClientProvider client={client}>
        <EditPage />
      </QueryClientProvider>,
    );
    expect(
      await screen.findByRole('heading', { name: 'Presentaciones del pollo', level: 2 }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cuarto \u2014 pierna' }));
    fireEvent.change(screen.getByLabelText('Precio de Cuarto \u2014 pierna'), {
      target: { value: '18.90' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar presentaciones' }));
    expect(await screen.findByText('Presentaciones guardadas.')).toBeVisible();
    expect(calls).toEqual([
      {
        portions: [
          { portion: 'quarter', cut: 'breast', priceCents: 1850 },
          { portion: 'quarter', cut: 'leg', priceCents: 1890 },
          { portion: 'whole', cut: null, priceCents: 6000 },
        ],
      },
    ]);
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['admin', 'products'] }),
    );
  });

  it('AC-12: guardar sin filas marcadas envía { portions: [] }', async () => {
    const calls: unknown[] = [];
    server.use(
      http.put('*/api/products/1/portions', async ({ request }) => {
        calls.push(await request.json());
        return HttpResponse.json({ portions: [] });
      }),
    );
    await renderChicken();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cuarto \u2014 pecho' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pollo entero' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar presentaciones' }));
    await waitFor(() => {
      expect(calls).toEqual([{ portions: [] }]);
    });
  });

  it('AC-12: con la grilla vacía guía al administrador', async () => {
    await renderChicken({ portions: [] });
    expect(
      screen.getByText('Marca las presentaciones que vendes y escribe su precio.'),
    ).toBeVisible();
    for (const label of ROW_LABELS) {
      expect(screen.getByRole('checkbox', { name: label })).not.toBeChecked();
    }
  });

  it.each(['', 'abc', '1050'])(
    'AC-13: una fila marcada con el precio "%s" muestra PRICE_INPUT_MESSAGE y no envía',
    async (price) => {
      const calls = vi.fn();
      server.use(
        http.put('*/api/products/1/portions', () => {
          calls();
          return HttpResponse.json({ portions: [] });
        }),
      );
      await renderChicken({ portions: [] });
      fireEvent.click(screen.getByRole('checkbox', { name: 'Medio pollo' }));
      if (price !== '')
        fireEvent.change(screen.getByLabelText('Precio de Medio pollo'), {
          target: { value: price },
        });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar presentaciones' }));
      expect(within(portionRow('Medio pollo')).getByText(PRICE_MESSAGE)).toBeInTheDocument();
      expect(calls).not.toHaveBeenCalled();
    },
  );

  it('AC-13: los issues portions.N del 400 van junto a la fila del envío y los de raíz a la sección', async () => {
    const calls: unknown[] = [];
    server.use(
      http.put('*/api/products/1/portions', async ({ request }) => {
        calls.push(await request.json());
        return HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Los datos enviados no son v\u00E1lidos.',
              details: {
                issues: [
                  { path: 'portions.1.priceCents', message: 'El precio de la fila 2 no va.' },
                  { path: 'portions', message: 'Hay presentaciones repetidas en la lista.' },
                ],
              },
            },
          },
          { status: 400 },
        );
      }),
    );
    await renderChicken();
    // Tres filas marcadas: la posición 1 del envío es 'Cuarto — pierna'.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cuarto \u2014 pierna' }));
    fireEvent.change(screen.getByLabelText('Precio de Cuarto \u2014 pierna'), {
      target: { value: '18.90' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar presentaciones' }));
    expect(
      await within(portionRow('Cuarto \u2014 pierna')).findByText('El precio de la fila 2 no va.'),
    ).toBeVisible();
    expect(await screen.findByText('Hay presentaciones repetidas en la lista.')).toBeVisible();
    expect(calls).toHaveLength(1);
    // El formulario conserva lo marcado para reintentar.
    expect(screen.getByRole('checkbox', { name: 'Cuarto \u2014 pierna' })).toBeChecked();
  });

  it('AC-13: el 409 PORTIONS_NOT_ALLOWED muestra su mensaje y conserva lo marcado', async () => {
    server.use(
      http.put('*/api/products/1/portions', () =>
        HttpResponse.json(
          {
            error: {
              code: 'PORTIONS_NOT_ALLOWED',
              message: 'Solo los productos de la categor\u00EDa Pollo pueden tener presentaciones.',
              details: null,
            },
          },
          { status: 409 },
        ),
      ),
    );
    await renderChicken();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar presentaciones' }));
    expect(
      await screen.findByText(
        'Solo los productos de la categor\u00EDa Pollo pueden tener presentaciones.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Cuarto \u2014 pecho' })).toBeChecked();
  });

  it('AC-13: un error de red muestra su mensaje y conserva lo marcado', async () => {
    server.use(http.put('*/api/products/1/portions', () => HttpResponse.error()));
    await renderChicken();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar presentaciones' }));
    expect(await screen.findByText(NETWORK)).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Cuarto \u2014 pecho' })).toBeChecked();
  });
});
