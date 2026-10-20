import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const HELPER_PATH = path.join(import.meta.dirname, 'product-image.ts');

type ProductImageHelper = (product: { name: string }) => string | null;

async function loadProductImageHelper(): Promise<ProductImageHelper> {
  expect(existsSync(HELPER_PATH)).toBe(true);
  const module = (await import(/* @vite-ignore */ pathToFileURL(HELPER_PATH).href)) as {
    getProductImage?: ProductImageHelper;
  };
  expect(module.getProductImage).toBeTypeOf('function');
  return module.getProductImage as ProductImageHelper;
}

describe('imágenes locales de productos', () => {
  it('AC-P02/P04/P08: conserva asociaciones existentes y reserva pollo-demo para Demo Pollo exacto', async () => {
    const getProductImage = await loadProductImageHelper();

    expect(getProductImage({ name: 'Demo Pollo' })).toBe('/images/pollo-demo.png');
    expect(getProductImage({ name: 'dEmO pOlLo' })).toBe('/images/pollo-demo.png');
    expect(getProductImage({ name: 'Demo Pollo familiar' })).toBeNull();
    expect(getProductImage({ name: 'Pollo Demo' })).toBeNull();
    expect(getProductImage({ name: 'Chaufa especial' })).toBe('/images/chaufa-demo.png');
    expect(getProductImage({ name: 'Chicha morada' })).toBe('/images/chicha-demo.png');
    expect(getProductImage({ name: 'Pollo a la brasa familiar' })).toBe('/images/pollo-demo.png');
    expect(getProductImage({ name: 'Pollo frito' })).toBeNull();
    expect(getProductImage({ name: 'Pollo broaster' })).toBeNull();
    expect(getProductImage({ name: 'Inca Kola' })).toBeNull();
  });
});
