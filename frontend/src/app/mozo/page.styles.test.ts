import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const PAGE_PATH = path.join(import.meta.dirname, 'page.tsx');
const MODULE_PATH = path.join(import.meta.dirname, 'page.module.css');
const GLOBAL_STYLES_PATH = path.resolve(import.meta.dirname, '../globals.css');
const pageSource = readFileSync(PAGE_PATH, 'utf8');
const moduleSource = existsSync(MODULE_PATH) ? readFileSync(MODULE_PATH, 'utf8') : '';
const globalSource = readFileSync(GLOBAL_STYLES_PATH, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('CSS Modules del tablero de mesas', () => {
  it('AC-M01: conecta el tablero, las tarjetas, sus nombres y detalles a page.module.css', () => {
    expect(existsSync(MODULE_PATH)).toBe(true);
    expect(pageSource.includes('salon-board')).toBe(false);

    const importedModule = pageSource.match(
      /import\s+(\w+)\s+from\s+['"]\.\/page\.module\.css['"]/,
    );
    expect(importedModule).not.toBeNull();
    const moduleAlias = importedModule?.[1] ?? 'styles';

    for (const publicClass of ['board', 'card', 'name', 'details']) {
      expect(moduleSource).toMatch(new RegExp(`\\.${publicClass}(?![\\w-])`));
      expect(pageSource).toMatch(new RegExp(`${moduleAlias}\\.${publicClass}\\b`));
    }
    expect(existsSync(path.join(import.meta.dirname, 'page.module.scss'))).toBe(false);
  });

  it('AC-M02: conserva la excepción de lista global mediante data-layout estable', () => {
    expect(/\[\s*data-layout\s*=\s*["']table-board["']\s*\]/.test(globalSource)).toBe(true);
    expect(pageSource.includes('data-layout="table-board"')).toBe(true);
  });

  it('AC-M02: elimina los estilos del tablero de globals.css', () => {
    expect(globalSource.includes('salon-board')).toBe(false);
  });

  it('AC-P01: presenta tarjetas claras sin el fondo azul especial anterior', () => {
    const cardSurfaceRule = moduleSource.match(/\.card\s*>\s*a\s*\{[^}]*\}/)?.[0] ?? '';

    expect(cardSurfaceRule).toMatch(
      /background(?:-color)?\s*:\s*(?:white|#fff(?:fff)?|var\([^;]*(?:surface|white|#fff)[^;]*\))/i,
    );
    expect(moduleSource.includes('#60a5fa33')).toBe(false);
  });
});
