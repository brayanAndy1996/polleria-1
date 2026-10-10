import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../tests/msw-server.ts';
import {
  createProduct,
  getComboItems,
  getProductPortions,
  getProducts,
  replaceComboItems,
  replaceProductPortions,
  updateProduct,
} from './products.ts';

const PRODUCT = { id: 3, name: 'Chaufa', category: 'dish', priceCents: 1400, isActive: true };
const PORTION = { id: 11, productId: 1, portion: 'quarter', cut: 'leg', priceCents: 1700 };
const COMBO_ITEM = {
  id: 21,
  comboId: 2,
  product: { id: 1, name: 'E2E Pollo', category: 'chicken', priceCents: 6500, isActive: true },
  quantity: 1,
  portion: 'quarter',
  cut: 'leg',
};
const errorBody = (code: string, message: string, details: unknown = null) => ({
  error: { code, message, details },
});

describe('008: funciones de la API de la carta', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('AC-04: getProducts hace GET /products y devuelve la lista validada', async () => {
    server.use(
      http.get('*/api/products', ({ request }) => {
        expect(request.method).toBe('GET');
        expect(request.url).toBe(`${window.location.origin}/api/products`);
        return HttpResponse.json({ products: [PRODUCT] });
      }),
    );
    await expect(getProducts()).resolves.toEqual([PRODUCT]);
  });
  it.each([{ products: [{ ...PRODUCT, stock: 4 }] }, { lista: [] }, { products: 'x' }, []])(
    'AC-04: getProducts rechaza la respuesta mal formada %s con el status real',
    async (body) => {
      server.use(http.get('*/api/products', () => HttpResponse.json(body)));
      await expect(getProducts()).rejects.toMatchObject({
        code: 'UNEXPECTED_RESPONSE',
        status: 200,
      });
    },
  );

  it('AC-04: createProduct hace POST con el cuerpo y exige 201 con Product válido', async () => {
    const seen = vi.fn();
    server.use(
      http.post('*/api/products', async ({ request }) => {
        expect(request.method).toBe('POST');
        seen(await request.json());
        return HttpResponse.json({ ...PRODUCT, id: 9, name: 'Salchipapa' }, { status: 201 });
      }),
    );
    const input = { name: 'Salchipapa', category: 'dish', priceCents: 1250 };
    await expect(createProduct(input)).resolves.toEqual({
      ...PRODUCT,
      id: 9,
      name: 'Salchipapa',
    });
    expect(seen).toHaveBeenCalledExactlyOnceWith(input);
    // Otro 2xx distinto del esperado se rechaza aunque el cuerpo sea válido.
    server.use(http.post('*/api/products', () => HttpResponse.json(PRODUCT)));
    await expect(createProduct(input)).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE' });
    // Un 201 con cuerpo que no es Product también se rechaza.
    server.use(
      http.post('*/api/products', () =>
        HttpResponse.json({ ...PRODUCT, stock: 4 }, { status: 201 }),
      ),
    );
    await expect(createProduct(input)).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE' });
  });

  it('AC-04: updateProduct hace PATCH /products/<id> con el cuerpo y exige 200', async () => {
    const seen = vi.fn();
    server.use(
      http.patch('*/api/products/3', async ({ request }) => {
        expect(request.method).toBe('PATCH');
        seen(await request.json());
        return HttpResponse.json({ ...PRODUCT, isActive: false });
      }),
    );
    await expect(updateProduct(3, { isActive: false })).resolves.toEqual({
      ...PRODUCT,
      isActive: false,
    });
    expect(seen).toHaveBeenCalledExactlyOnceWith({ isActive: false });
    server.use(http.patch('*/api/products/3', () => HttpResponse.json(PRODUCT, { status: 201 })));
    await expect(updateProduct(3, { isActive: false })).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
    });
  });

  it('AC-04: getProductPortions hace GET /products/<id>/portions y valida la lista', async () => {
    server.use(
      http.get('*/api/products/1/portions', ({ request }) => {
        expect(request.method).toBe('GET');
        expect(request.url).toBe(`${window.location.origin}/api/products/1/portions`);
        return HttpResponse.json({ portions: [PORTION] });
      }),
    );
    await expect(getProductPortions(1)).resolves.toEqual([PORTION]);
    server.use(http.get('*/api/products/1/portions', () => HttpResponse.json({ lista: [] })));
    await expect(getProductPortions(1)).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      status: 200,
    });
  });

  it('AC-04: replaceProductPortions hace PUT con el conjunto completo y exige 200', async () => {
    const seen = vi.fn();
    server.use(
      http.put('*/api/products/1/portions', async ({ request }) => {
        expect(request.method).toBe('PUT');
        seen(await request.json());
        return HttpResponse.json({ portions: [PORTION] });
      }),
    );
    const input = {
      portions: [
        { portion: 'quarter', cut: 'leg', priceCents: 1700 },
        { portion: 'whole', cut: null, priceCents: 6500 },
      ],
    };
    await expect(replaceProductPortions(1, input)).resolves.toEqual([PORTION]);
    expect(seen).toHaveBeenCalledExactlyOnceWith(input);
    server.use(
      http.put('*/api/products/1/portions', () =>
        HttpResponse.json({ portions: [{ ...PORTION, extra: 1 }] }),
      ),
    );
    await expect(replaceProductPortions(1, input)).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
    });
  });

  it('AC-04: getComboItems hace GET /products/<id>/items y valida la lista', async () => {
    server.use(
      http.get('*/api/products/2/items', ({ request }) => {
        expect(request.method).toBe('GET');
        expect(request.url).toBe(`${window.location.origin}/api/products/2/items`);
        return HttpResponse.json({ items: [COMBO_ITEM] });
      }),
    );
    await expect(getComboItems(2)).resolves.toEqual([COMBO_ITEM]);
    server.use(http.get('*/api/products/2/items', () => HttpResponse.json({ items: [{}] })));
    await expect(getComboItems(2)).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      status: 200,
    });
  });

  it('AC-04: replaceComboItems hace PUT con el conjunto completo y exige 200', async () => {
    const seen = vi.fn();
    server.use(
      http.put('*/api/products/2/items', async ({ request }) => {
        expect(request.method).toBe('PUT');
        seen(await request.json());
        return HttpResponse.json({ items: [COMBO_ITEM] });
      }),
    );
    const input = { items: [{ productId: 1, quantity: 1, portion: 'quarter', cut: 'leg' }] };
    await expect(replaceComboItems(2, input)).resolves.toEqual([COMBO_ITEM]);
    expect(seen).toHaveBeenCalledExactlyOnceWith(input);
    server.use(http.put('*/api/products/2/items', () => HttpResponse.json({ items: [{}] })));
    await expect(replaceComboItems(2, input)).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
    });
  });

  it.each<
    [string, () => Promise<unknown>, string, typeof http.get, number, string, string, unknown]
  >([
    [
      'createProduct',
      () => createProduct({ name: 'Chaufa', category: 'dish', priceCents: 1400 }),
      '*/api/products',
      http.post,
      409,
      'PRODUCT_NAME_TAKEN',
      'Ya existe un producto con ese nombre.',
      null,
    ],
    [
      'updateProduct',
      () => updateProduct(3, { name: 'Otro' }),
      '*/api/products/3',
      http.patch,
      409,
      'PRODUCT_HAS_PORTIONS',
      'Este producto tiene presentaciones de pollo; qu\u00EDtalas antes de cambiar su categor\u00EDa.',
      null,
    ],
    [
      'updateProduct',
      () => updateProduct(99, { isActive: false }),
      '*/api/products/99',
      http.patch,
      404,
      'PRODUCT_NOT_FOUND',
      'Ese producto no existe.',
      null,
    ],
    [
      'getProductPortions',
      () => getProductPortions(99),
      '*/api/products/99/portions',
      http.get,
      404,
      'PRODUCT_NOT_FOUND',
      'Ese producto no existe.',
      null,
    ],
    [
      'replaceProductPortions',
      () => replaceProductPortions(3, { portions: [] }),
      '*/api/products/3/portions',
      http.put,
      409,
      'PORTIONS_NOT_ALLOWED',
      'Solo los productos de la categor\u00EDa Pollo pueden tener presentaciones.',
      null,
    ],
    [
      'getComboItems',
      () => getComboItems(99),
      '*/api/products/99/items',
      http.get,
      404,
      'PRODUCT_NOT_FOUND',
      'Ese producto no existe.',
      null,
    ],
    [
      'replaceComboItems',
      () => replaceComboItems(2, { items: [] }),
      '*/api/products/2/items',
      http.put,
      409,
      'COMBO_ITEMS_NOT_ALLOWED',
      'Solo los productos de la categor\u00EDa Combos pueden tener componentes.',
      null,
    ],
    [
      'replaceComboItems',
      () =>
        replaceComboItems(2, {
          items: [{ productId: 99, quantity: 1, portion: null, cut: null }],
        }),
      '*/api/products/2/items',
      http.put,
      400,
      'VALIDATION_ERROR',
      'Los datos enviados no son v\u00E1lidos.',
      { issues: [{ path: 'items.0.productId', message: 'Ese producto no existe.' }] },
    ],
  ])(
    'AC-04: %s conserva code, message y details del error %s de la API',
    async (_name, call, path, method, status, code, message, details) => {
      server.use(
        method(path, () => HttpResponse.json(errorBody(code, message, details), { status })),
      );
      await expect(call()).rejects.toMatchObject({ status, code, message, details });
    },
  );
});
