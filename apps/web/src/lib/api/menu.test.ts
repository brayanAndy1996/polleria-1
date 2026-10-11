// AC-02 (getMenu). Spec 011 — archivo nuevo: va EN ROJO hasta que T-09 cree
// apps/web/src/lib/api/menu.ts con getMenu. MSW intercepta /api/menu del mismo
// origen y verifica método, ruta y la validación por menuResponseSchema.
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../../tests/msw-server.ts';
import { getMenu } from './menu.ts';

const MENU_POLLO = {
  id: 1,
  name: 'Pollo a la brasa',
  category: 'chicken',
  priceCents: 6500,
  portions: [
    { portion: 'quarter', cut: 'breast', priceCents: 1800 },
    { portion: 'quarter', cut: 'leg', priceCents: 1700 },
    { portion: 'half', cut: null, priceCents: 3400 },
    { portion: 'whole', cut: null, priceCents: 6500 },
  ],
  items: [],
};
const MENU_COMBO = {
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
  ],
};
const MENU_BEBIDA = {
  id: 4,
  name: 'Inca Kola',
  category: 'drink',
  priceCents: 400,
  portions: [],
  items: [],
};
const MENU_AJI = {
  id: 6,
  name: 'Ají',
  category: 'sauce',
  priceCents: 0,
  portions: [],
  items: [],
};

describe('011: función de la API de la carta del mozo', () => {
  it('AC-02: getMenu hace GET /menu y devuelve la carta validada con portions e items', async () => {
    server.use(
      http.get('*/api/menu', ({ request }) => {
        expect(request.method).toBe('GET');
        expect(request.url).toBe(`${window.location.origin}/api/menu`);
        return HttpResponse.json({
          products: [MENU_POLLO, MENU_COMBO, MENU_BEBIDA, MENU_AJI],
        });
      }),
    );
    await expect(getMenu()).resolves.toEqual([MENU_POLLO, MENU_COMBO, MENU_BEBIDA, MENU_AJI]);
  });

  it.each([
    { products: [{ ...MENU_BEBIDA, stock: 4 }] },
    { products: [{ ...MENU_POLLO, portions: [{ portion: 'quarter' }] }] },
    { lista: [] },
    { products: 'x' },
    [],
  ])(
    'AC-02: getMenu rechaza la respuesta mal formada %s conservando el status real',
    async (body) => {
      server.use(http.get('*/api/menu', () => HttpResponse.json(body)));
      await expect(getMenu()).rejects.toMatchObject({
        code: 'UNEXPECTED_RESPONSE',
        status: 200,
      });
    },
  );

  it('AC-02: getMenu propaga el ApiError de la API (INTERNAL_ERROR 500)', async () => {
    server.use(
      http.get('*/api/menu', () =>
        HttpResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Algo falló.', details: null } },
          { status: 500 },
        ),
      ),
    );
    await expect(getMenu()).rejects.toMatchObject({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Algo falló.',
    });
  });
});
