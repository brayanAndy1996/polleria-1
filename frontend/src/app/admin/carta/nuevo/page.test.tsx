import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PRODUCT_NAME_MESSAGE } from '@polleria/shared';
import { server } from '../../../../../tests/msw-server.ts';
import { hardNavigate } from '../../../../lib/navigation.ts';
import NuevoPage from './page.tsx';

const mocks = vi.hoisted(() => ({ replace: vi.fn(), params: { id: '1' } }));
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
const CREATED = {
  id: 9,
  name: 'Salchipapa',
  category: 'dish',
  priceCents: 1250,
  isActive: true,
};
const errorBody = (code: string, message: string, details: unknown = null) => ({
  error: { code, message, details },
});
const PRICE_MESSAGE =
  'Escribe el precio en soles (por ejemplo 18.50). El m\u00E1ximo es S/ 999.99.';
const NETWORK = 'Sin conexi\u00F3n con el servidor. Revisa el wifi e intenta de nuevo.';

function show(node: ReactNode, client?: QueryClient) {
  const queryClient =
    client ?? new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}
async function renderForm() {
  show(<NuevoPage />);
  expect(await screen.findByRole('heading', { name: 'Agregar producto', level: 1 })).toBeVisible();
}
function fillForm(price = '12.50') {
  fireEvent.change(screen.getByLabelText('Nombre del producto'), {
    target: { value: 'Salchipapa' },
  });
  fireEvent.click(screen.getByRole('radio', { name: 'Platos' }));
  fireEvent.change(screen.getByLabelText('Precio'), { target: { value: price } });
}

describe('008: alta de producto (/admin/carta/nuevo)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/admin/carta/nuevo');
    server.use(http.get('*/api/auth/me', () => HttpResponse.json(SESSION_ADMIN)));
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
    show(<NuevoPage />);
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/caja');
    });
    expect(screen.queryByRole('heading', { name: 'Agregar producto' })).not.toBeInTheDocument();
    mocks.replace.mockClear();
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json(errorBody('UNAUTHENTICATED', 'x'), { status: 401 }),
      ),
    );
    show(<NuevoPage />);
    await waitFor(() => {
      expect(hardNavigate).toHaveBeenCalledWith('/login');
    });
  });

  it('AC-08: muestra h1, vuelta, campos y un radio por categoría sin preselección', async () => {
    await renderForm();
    expect(screen.getByRole('link', { name: 'Volver a la carta' })).toHaveAttribute(
      'href',
      '/admin/carta',
    );
    expect(screen.getByLabelText('Nombre del producto')).toBeVisible();
    const group = screen.getByRole('group', { name: 'Categor\u00EDa' });
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(7);
    // Las etiquetas aparecen en el orden de la carta, sea cual sea la marcación.
    const groupText = group.textContent ?? '';
    const positions = ['Pollo', 'Combos', 'Platos', 'Bebidas', 'Postres', 'Cremas', 'Extras'].map(
      (label) => groupText.indexOf(label),
    );
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    for (const radio of radios) expect(radio).not.toBeChecked();
    const price = screen.getByLabelText('Precio');
    expect(price).toHaveAttribute('inputmode', 'decimal');
    expect(screen.getByText('En soles, por ejemplo 18.50.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Crear producto' })).toBeEnabled();
  });

  it('AC-08: al escribir un precio válido se ve la vista previa en soles', async () => {
    await renderForm();
    fireEvent.change(screen.getByLabelText('Precio'), { target: { value: '18.50' } });
    expect(await screen.findByText('S/ 18.50')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Precio'), { target: { value: 'abc' } });
    expect(screen.queryByText('S/ 18.50')).not.toBeInTheDocument();
  });

  it('AC-08: envía un solo POST en céntimos, deshabilita el botón e invalida la lista', async () => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls: unknown[] = [];
    server.use(
      http.post('*/api/products', async ({ request }) => {
        calls.push(await request.json());
        await waiting;
        return HttpResponse.json(CREATED, { status: 201 });
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    show(<NuevoPage />, client);
    await renderForm();
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));
    const sending = await screen.findByRole('button', { name: 'Creando...' });
    expect(sending).toBeDisabled();
    fireEvent.click(sending);
    release();
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/admin/carta');
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ name: 'Salchipapa', category: 'dish', priceCents: 1250 });
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['admin', 'products'] }),
    );
  });

  it.each([
    [
      'Pollo',
      'chicken',
      { id: 10, name: 'Pollo al cilindro', category: 'chicken', priceCents: 4500, isActive: true },
      '/admin/carta/10',
    ],
    [
      'Combos',
      'combo',
      { id: 11, name: 'Mostrito', category: 'combo', priceCents: 2200, isActive: true },
      '/admin/carta/11',
    ],
  ])(
    'AC-08: tras crear un producto %s se aterriza en su edición (%s)',
    async (radio, category, created, destination) => {
      server.use(http.post('*/api/products', () => HttpResponse.json(created, { status: 201 })));
      await renderForm();
      fireEvent.change(screen.getByLabelText('Nombre del producto'), {
        target: { value: created.name },
      });
      fireEvent.click(screen.getByRole('radio', { name: radio }));
      fireEvent.change(screen.getByLabelText('Precio'), { target: { value: '22.00' } });
      fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));
      await waitFor(() => {
        expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(destination);
      });
    },
  );

  it('AC-08: el nombre vacío muestra el mensaje del esquema y no llama a la API', async () => {
    const calls = vi.fn();
    server.use(
      http.post('*/api/products', () => {
        calls();
        return HttpResponse.json(CREATED, { status: 201 });
      }),
    );
    await renderForm();
    // Categoría y precio válidos; el nombre queda vacío.
    fireEvent.click(screen.getByRole('radio', { name: 'Platos' }));
    fireEvent.change(screen.getByLabelText('Precio'), { target: { value: '12.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));
    expect(await screen.findByText(PRODUCT_NAME_MESSAGE)).toBeVisible();
    expect(calls).not.toHaveBeenCalled();
  });

  it('AC-08: la categoría sin elegir muestra su mensaje y no llama a la API', async () => {
    const calls = vi.fn();
    server.use(
      http.post('*/api/products', () => {
        calls();
        return HttpResponse.json(CREATED, { status: 201 });
      }),
    );
    await renderForm();
    // Nombre y precio válidos; ningún radio marcado.
    fireEvent.change(screen.getByLabelText('Nombre del producto'), {
      target: { value: 'Salchipapa' },
    });
    fireEvent.change(screen.getByLabelText('Precio'), { target: { value: '12.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));
    expect(await screen.findByText('Elige una categor\u00EDa.')).toBeVisible();
    expect(calls).not.toHaveBeenCalled();
  });

  it.each(['abc', '  ', '1050', '1850', '18.505'])(
    'AC-08: el precio "%s" que no da un precio válido muestra PRICE_INPUT_MESSAGE',
    async (price) => {
      const calls = vi.fn();
      server.use(
        http.post('*/api/products', () => {
          calls();
          return HttpResponse.json(CREATED, { status: 201 });
        }),
      );
      await renderForm();
      fillForm(price);
      fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));
      expect(await screen.findByText(PRICE_MESSAGE)).toBeVisible();
      expect(calls).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      409,
      errorBody('PRODUCT_NAME_TAKEN', 'Ya existe un producto con ese nombre.'),
      'Ya existe un producto con ese nombre.',
    ],
    [
      400,
      errorBody('VALIDATION_ERROR', 'Los datos enviados no son v\u00E1lidos.', {
        issues: [
          {
            path: 'priceCents',
            message: 'El precio debe ser un n\u00FAmero entero de c\u00E9ntimos entre 0 y 99999.',
          },
        ],
      }),
      'El precio debe ser un n\u00FAmero entero de c\u00E9ntimos entre 0 y 99999.',
    ],
    [0, null, NETWORK],
  ])(
    'AC-09: el error %s de la API se muestra con alert, conserva lo escrito y permite reenviar',
    async (status, body, message) => {
      server.use(
        http.post('*/api/products', () =>
          status === 0 ? HttpResponse.error() : HttpResponse.json(body as object, { status }),
        ),
      );
      await renderForm();
      fillForm();
      fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(screen.getByLabelText('Nombre del producto')).toHaveValue('Salchipapa');
      expect(screen.getByRole('radio', { name: 'Platos' })).toBeChecked();
      expect(screen.getByLabelText('Precio')).toHaveValue('12.50');
      expect(mocks.replace).not.toHaveBeenCalled();
      server.use(http.post('*/api/products', () => HttpResponse.json(CREATED, { status: 201 })));
      fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));
      await waitFor(() => {
        expect(mocks.replace).toHaveBeenCalledWith('/admin/carta');
      });
    },
  );
});
