import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, delay, http } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../../tests/msw-server.ts';
import { hardNavigate } from '../../../lib/navigation.ts';
import CartaPage from './page.tsx';

const mocks = vi.hoisted(() => ({ replace: vi.fn(), params: { id: '1' } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useParams: () => mocks.params,
}));
vi.mock('../../../lib/navigation.ts', () => ({ hardNavigate: vi.fn() }));

const SESSION_ADMIN = {
  user: { id: 1, username: 'dueno', displayName: 'Carlos', roles: ['admin'] },
  expiresAt: '2026-10-09T07:00:00.000Z',
};
// El orden es el que devuelve la API (categoría de la carta, luego nombre).
const PRODUCTS = [
  { id: 1, name: 'Pollo a la brasa', category: 'chicken', priceCents: 6500, isActive: true },
  { id: 2, name: 'Mostrito', category: 'combo', priceCents: 2200, isActive: true },
  { id: 3, name: 'Chaufa', category: 'dish', priceCents: 1400, isActive: true },
  { id: 4, name: 'Inca Kola', category: 'drink', priceCents: 400, isActive: true },
  { id: 5, name: 'Tres Leches', category: 'dessert', priceCents: 500, isActive: false },
  { id: 6, name: 'Aj\u00ED', category: 'sauce', priceCents: 0, isActive: true },
];
const errorBody = (code: string) => ({
  error: { code, message: 'Mensaje.', details: null },
});

function show(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
function mockSession() {
  server.use(http.get('*/api/auth/me', () => HttpResponse.json(SESSION_ADMIN)));
}
function mockProducts(products: unknown = PRODUCTS) {
  server.use(http.get('*/api/products', () => HttpResponse.json({ products })));
}
/** Fila del producto: el ancestro más cercano del nombre que contiene el enlace Editar. */
function productRow(name: string): HTMLElement {
  let element: HTMLElement | null = screen.getByText(name);
  while (element !== null) {
    const link = element.querySelector('a[href^="/admin/carta/"]');
    if (link && /\/admin\/carta\/\d+$/.test(link.getAttribute('href') ?? '')) break;
    element = element.parentElement;
  }
  expect(element, `fila de ${name}`).not.toBeNull();
  return element as HTMLElement;
}

describe('008: lista de la carta (/admin/carta)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/admin/carta');
    mockSession();
    mockProducts();
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
    show(<CartaPage />);
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/caja');
    });
    expect(screen.queryByRole('heading', { name: 'Carta', level: 1 })).not.toBeInTheDocument();
    mocks.replace.mockClear();
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json(errorBody('UNAUTHENTICATED'), { status: 401 }),
      ),
    );
    show(<CartaPage />);
    await waitFor(() => {
      expect(hardNavigate).toHaveBeenCalledWith('/login');
    });
    expect(screen.queryByRole('heading', { name: 'Carta', level: 1 })).not.toBeInTheDocument();
  });

  it('AC-06: muestra "Cargando carta..." mientras llega la lista', async () => {
    server.use(
      http.get('*/api/products', async () => {
        await delay('infinite');
        return HttpResponse.json({ products: [] });
      }),
    );
    show(<CartaPage />);
    // La sesión sí responde: el estado visible es el de la lista, no el de la guardia.
    expect(await screen.findByText('Carlos · Administrador')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Cargando carta...');
  });

  it('AC-06: muestra h1, enlace de alta y secciones h2 por categoría en el orden de la carta', async () => {
    show(<CartaPage />);
    expect(await screen.findByRole('heading', { name: 'Carta', level: 1 })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Agregar producto' })).toHaveAttribute(
      'href',
      '/admin/carta/nuevo',
    );
    const sections = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    // Extras no aparece: no tiene productos en la lista.
    expect(sections).toEqual(['Pollo', 'Combos', 'Platos', 'Bebidas', 'Postres', 'Cremas']);
  });

  it('AC-06: cada fila muestra nombre, precio formateado, estado y acciones', async () => {
    show(<CartaPage />);
    expect(await screen.findByRole('heading', { name: 'Carta', level: 1 })).toBeVisible();
    const pollo = productRow('Pollo a la brasa');
    expect(within(pollo).getByText('S/ 65.00')).toBeInTheDocument();
    expect(within(pollo).queryByText('Desactivado')).not.toBeInTheDocument();
    expect(within(pollo).getByRole('link', { name: 'Editar' })).toHaveAttribute(
      'href',
      '/admin/carta/1',
    );
    expect(within(pollo).getByRole('button', { name: 'Desactivar' })).toBeInTheDocument();
    expect(within(productRow('Aj\u00ED')).getByText('S/ 0.00')).toBeInTheDocument();
    const tresLeches = productRow('Tres Leches');
    expect(within(tresLeches).getByText('S/ 5.00')).toBeInTheDocument();
    expect(within(tresLeches).getByText('Desactivado')).toBeInTheDocument();
    expect(within(tresLeches).getByRole('button', { name: 'Activar' })).toBeInTheDocument();
    expect(within(tresLeches).getByRole('link', { name: 'Editar' })).toHaveAttribute(
      'href',
      '/admin/carta/5',
    );
    // Solo Tres Leches lleva la marca.
    expect(screen.getAllByText('Desactivado')).toHaveLength(1);
  });

  it('AC-06: con la lista vacía muestra el estado vacío y mantiene el alta', async () => {
    mockProducts([]);
    show(<CartaPage />);
    expect(await screen.findByRole('heading', { name: 'Carta', level: 1 })).toBeVisible();
    expect(screen.getByText('La carta est\u00E1 vac\u00EDa.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Agregar producto' })).toHaveAttribute(
      'href',
      '/admin/carta/nuevo',
    );
  });

  it.each(['500', 'red'])(
    'AC-06: un fallo %s de la API muestra el error y Reintentar vuelve a consultar',
    async (kind) => {
      const fail = () =>
        kind === 'red'
          ? HttpResponse.error()
          : HttpResponse.json(errorBody('INTERNAL_ERROR'), { status: 500 });
      server.use(http.get('*/api/products', fail));
      show(<CartaPage />);
      expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar la carta.');
      server.use(http.get('*/api/products', () => HttpResponse.json({ products: PRODUCTS })));
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
      expect(await screen.findByRole('heading', { name: 'Carta', level: 1 })).toBeVisible();
      expect(screen.getByText('Chaufa')).toBeVisible();
    },
  );

  it('AC-07: desactivar pide confirmación y la fila pasa a Desactivado con Activar', async () => {
    let products = structuredClone(PRODUCTS);
    const calls: unknown[] = [];
    server.use(
      http.get('*/api/products', () => HttpResponse.json({ products })),
      http.patch('*/api/products/3', async ({ request }) => {
        const body = await request.json();
        calls.push(body);
        products = products.map((item) =>
          item.id === 3 ? { ...item, ...(body as object) } : item,
        );
        return HttpResponse.json(products.find((item) => item.id === 3));
      }),
    );
    show(<CartaPage />);
    await screen.findByText('Chaufa');
    const row = productRow('Chaufa');
    fireEvent.click(within(row).getByRole('button', { name: 'Desactivar' }));
    await waitFor(() => {
      expect(document.body.textContent).toContain(
        '\u00BFDesactivar Chaufa? Dejar\u00E1 de aparecer en la carta.',
      );
    });
    expect(calls).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'S\u00ED, desactivar' }));
    await waitFor(() => {
      expect(calls).toEqual([{ isActive: false }]);
    });
    expect(await within(row).findByText('Desactivado')).toBeVisible();
    expect(within(row).getByRole('button', { name: 'Activar' })).toBeVisible();
  });

  it('AC-07: Cancelar en la confirmación no envía nada', async () => {
    const calls = vi.fn();
    server.use(
      http.patch('*/api/products/3', () => {
        calls();
        return HttpResponse.json({ ...PRODUCTS[2], isActive: false });
      }),
    );
    show(<CartaPage />);
    await screen.findByText('Chaufa');
    const row = productRow('Chaufa');
    fireEvent.click(within(row).getByRole('button', { name: 'Desactivar' }));
    await waitFor(() => {
      expect(document.body.textContent).toContain('\u00BFDesactivar Chaufa?');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(calls).not.toHaveBeenCalled();
    expect(within(row).queryByText('Desactivado')).not.toBeInTheDocument();
  });

  it('AC-07: activar un producto inactivo envía el PATCH sin pedir confirmación', async () => {
    let products = structuredClone(PRODUCTS);
    const calls: unknown[] = [];
    server.use(
      http.get('*/api/products', () => HttpResponse.json({ products })),
      http.patch('*/api/products/5', async ({ request }) => {
        const body = await request.json();
        calls.push(body);
        products = products.map((item) =>
          item.id === 5 ? { ...item, ...(body as object) } : item,
        );
        return HttpResponse.json(products.find((item) => item.id === 5));
      }),
    );
    show(<CartaPage />);
    await screen.findByText('Tres Leches');
    const row = productRow('Tres Leches');
    fireEvent.click(within(row).getByRole('button', { name: 'Activar' }));
    await waitFor(() => {
      expect(calls).toEqual([{ isActive: true }]);
    });
    expect(screen.queryByRole('button', { name: 'S\u00ED, activar' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(within(row).queryByText('Desactivado')).not.toBeInTheDocument();
    });
  });

  it.each(['red', '404'])(
    'AC-07: un fallo %s al desactivar muestra el mensaje y la fila no cambia',
    async (kind) => {
      const fail = () =>
        kind === 'red'
          ? HttpResponse.error()
          : HttpResponse.json(errorBody('PRODUCT_NOT_FOUND'), { status: 404 });
      server.use(http.patch('*/api/products/3', fail));
      show(<CartaPage />);
      await screen.findByText('Chaufa');
      const row = productRow('Chaufa');
      fireEvent.click(within(row).getByRole('button', { name: 'Desactivar' }));
      fireEvent.click(await screen.findByRole('button', { name: 'S\u00ED, desactivar' }));
      const message =
        kind === 'red'
          ? 'Sin conexi\u00F3n con el servidor. Revisa el wifi e intenta de nuevo.'
          : 'Mensaje.';
      expect(await screen.findByText(message)).toBeVisible();
      expect(within(row).queryByText('Desactivado')).not.toBeInTheDocument();
      expect(within(row).getByRole('button', { name: 'Desactivar' })).toBeInTheDocument();
    },
  );
});
