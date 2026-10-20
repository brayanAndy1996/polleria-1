import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, delay, http } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../../../tests/msw-server.ts';
import { hardNavigate } from '../../../../lib/navigation.ts';
import EditPage from './page.tsx';

const mocks = vi.hoisted(() => ({ replace: vi.fn(), params: { id: '3' } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => window.location.pathname,
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
  { id: 6, name: 'Tres Leches', category: 'dessert', priceCents: 500, isActive: false },
];
const errorBody = (code: string, message: string) => ({
  error: { code, message, details: null },
});

function show(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
function mockBase(products: unknown = PRODUCTS) {
  server.use(
    http.get('*/api/products', () => HttpResponse.json({ products })),
    // Sin filas por defecto: las secciones que consultan no cuelgan la página.
    http.get('*/api/products/:productId/portions', () => HttpResponse.json({ portions: [] })),
    http.get('*/api/products/:productId/items', () => HttpResponse.json({ items: [] })),
  );
}
async function renderPage() {
  show(<EditPage />);
  expect(await screen.findByRole('heading', { name: 'Editar producto', level: 1 })).toBeVisible();
}

describe('008: edición de producto — datos y estado (/admin/carta/[id])', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/admin/carta/3');
    mocks.params.id = '3';
    server.use(http.get('*/api/auth/me', () => HttpResponse.json(SESSION_ADMIN)));
    mockBase();
  });

  it('AC-05: exige el rol admin (un cajero va a /caja) y sin sesión recarga en /login', async () => {
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({
          user: { id: 4, username: 'caja.ana', displayName: 'Ana', roles: ['cashier'] },
          expiresAt: '2026-10-09T07:00:00.000Z',
        }),
      ),
    );
    show(<EditPage />);
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/caja');
    });
    expect(screen.queryByRole('heading', { name: 'Editar producto' })).not.toBeInTheDocument();
    mocks.replace.mockClear();
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json(errorBody('UNAUTHENTICATED', 'x'), { status: 401 }),
      ),
    );
    show(<EditPage />);
    await waitFor(() => {
      expect(hardNavigate).toHaveBeenCalledWith('/login');
    });
  });

  it('AC-10: mientras la lista carga muestra "Cargando..." con role status', async () => {
    server.use(
      http.get('*/api/products', async () => {
        await delay('infinite');
        return HttpResponse.json({ products: [] });
      }),
    );
    show(<EditPage />);
    expect(await screen.findByText('Carlos · Administrador')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Cargando...');
  });

  it('AC-10: un id fuera de la lista muestra "Ese producto no existe." sin formulario', async () => {
    mocks.params.id = '99';
    show(<EditPage />);
    expect(await screen.findByText('Ese producto no existe.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a la carta' })).toHaveAttribute(
      'href',
      '/admin/carta',
    );
  });

  it('AC-10: la sección Datos llega precargada con el nombre, la categoría y el precio', async () => {
    await renderPage();
    expect(screen.getByRole('link', { name: 'Volver a la carta' })).toHaveAttribute(
      'href',
      '/admin/carta',
    );
    expect(screen.getByRole('heading', { name: 'Datos', level: 2 })).toBeVisible();
    expect(screen.getByLabelText('Nombre del producto')).toHaveValue('Chaufa');
    expect(screen.getByRole('radio', { name: 'Platos' })).toBeChecked();
    expect(screen.getByLabelText('Precio')).toHaveValue('14.00');
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled();
  });

  it('AC-10: guarda con un solo PATCH en céntimos y muestra "Cambios guardados."', async () => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls: unknown[] = [];
    server.use(
      http.patch('*/api/products/3', async ({ request }) => {
        calls.push(await request.json());
        await waiting;
        return HttpResponse.json({
          id: 3,
          name: 'Chaufa especial',
          category: 'dish',
          priceCents: 1550,
          isActive: true,
        });
      }),
    );
    await renderPage();
    fireEvent.change(screen.getByLabelText('Nombre del producto'), {
      target: { value: 'Chaufa especial' },
    });
    fireEvent.change(screen.getByLabelText('Precio'), { target: { value: '15.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    const sending = await screen.findByRole('button', { name: 'Guardando...' });
    expect(sending).toBeDisabled();
    release();
    expect(await screen.findByText('Cambios guardados.')).toBeVisible();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      name: 'Chaufa especial',
      category: 'dish',
      priceCents: 1550,
    });
  });

  it.each([
    ['Pollo', 'chicken', 'Presentaciones del pollo'],
    ['Combos', 'combo', 'Componentes del combo'],
  ])(
    'AC-10: al guardar el cambio de categoría a %s aparece la sección "%s"',
    async (radio, category, sectionName) => {
      server.use(
        http.patch('*/api/products/3', () =>
          HttpResponse.json({ ...PRODUCTS[2], category }, { status: 200 }),
        ),
      );
      await renderPage();
      expect(screen.queryByRole('heading', { name: sectionName })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('radio', { name: radio }));
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
      expect(await screen.findByText('Cambios guardados.')).toBeVisible();
      expect(await screen.findByRole('heading', { name: sectionName, level: 2 })).toBeVisible();
    },
  );

  it.each([
    ['PRODUCT_NAME_TAKEN', 'Ya existe un producto con ese nombre.'],
    [
      'PRODUCT_HAS_PORTIONS',
      'Este producto tiene presentaciones de pollo; qu\u00EDtalas antes de cambiar su categor\u00EDa.',
    ],
    [
      'PRODUCT_HAS_ITEMS',
      'Este producto es un combo con componentes; quita sus componentes antes de cambiar su categor\u00EDa.',
    ],
    [
      'PRODUCT_IS_COMPONENT',
      'Este producto es componente de un combo; qu\u00EDtalo del combo antes de cambiar su categor\u00EDa.',
    ],
    ['PRODUCT_NOT_FOUND', 'Ese producto no existe.'],
  ])(
    'AC-11: el error 409/404 %s de la API se muestra tal cual sin guardar',
    async (code, message) => {
      server.use(
        http.patch('*/api/products/3', () =>
          HttpResponse.json(errorBody(code, message), {
            status: code === 'PRODUCT_NOT_FOUND' ? 404 : 409,
          }),
        ),
      );
      await renderPage();
      fireEvent.change(screen.getByLabelText('Nombre del producto'), {
        target: { value: 'Chaufa especial' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
      expect(await screen.findByText(message)).toBeVisible();
      expect(screen.queryByText('Cambios guardados.')).not.toBeInTheDocument();
    },
  );

  it('AC-11: un chicken con presentaciones muestra la nota de precio de referencia', async () => {
    mocks.params.id = '1';
    server.use(
      http.get('*/api/products/1/portions', () =>
        HttpResponse.json({
          portions: [{ id: 11, productId: 1, portion: 'quarter', cut: 'leg', priceCents: 1700 }],
        }),
      ),
    );
    await renderPage();
    expect(
      await screen.findByText(
        'El cobro usa el precio de cada presentaci\u00F3n; este precio queda solo de referencia.',
      ),
    ).toBeVisible();
  });

  it('AC-11: la sección Estado desactiva con confirmación y la marca cambia', async () => {
    const calls: unknown[] = [];
    server.use(
      http.patch('*/api/products/3', async ({ request }) => {
        calls.push(await request.json());
        return HttpResponse.json({ ...PRODUCTS[2], isActive: false });
      }),
    );
    await renderPage();
    expect(screen.getByRole('heading', { name: 'Estado', level: 2 })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
    await waitFor(() => {
      expect(document.body.textContent).toContain(
        '\u00BFDesactivar Chaufa? Dejar\u00E1 de aparecer en la carta.',
      );
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(calls).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'S\u00ED, desactivar' }));
    await waitFor(() => {
      expect(calls).toEqual([{ isActive: false }]);
    });
    expect(await screen.findByText('Desactivado')).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Activar' })).toBeVisible();
  });

  it('AC-11: Activar en un producto inactivo envía el PATCH directo', async () => {
    mocks.params.id = '6';
    const calls: unknown[] = [];
    server.use(
      http.patch('*/api/products/6', async ({ request }) => {
        calls.push(await request.json());
        return HttpResponse.json({ ...PRODUCTS[3], isActive: true });
      }),
    );
    await renderPage();
    expect(screen.getByText('Desactivado')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Activar' }));
    await waitFor(() => {
      expect(calls).toEqual([{ isActive: true }]);
    });
    expect(screen.queryByRole('button', { name: 'S\u00ED, activar' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('Desactivado')).not.toBeInTheDocument();
    });
  });
});
