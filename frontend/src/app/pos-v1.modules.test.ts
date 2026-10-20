import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_DIR = import.meta.dirname;
const MODULE_SURFACES = [
  {
    name: 'compositor de pedidos',
    pagePath: path.join(APP_DIR, 'mozo', 'mesas', '[tableId]', 'agregar', 'page.tsx'),
  },
  { name: 'carta administrativa', pagePath: path.join(APP_DIR, 'admin', 'carta', 'page.tsx') },
];

describe('CSS Modules de las superficies POS', () => {
  it.each(MODULE_SURFACES)('AC-P06: $name usa una hoja CSS Module conectada', ({ pagePath }) => {
    const pageSource = readFileSync(pagePath, 'utf8');
    const importMatch = pageSource.match(/import\s+(\w+)\s+from\s+['"]([^'"]+\.module\.css)['"]/);

    expect(importMatch).not.toBeNull();
    const moduleAlias = importMatch?.[1] ?? 'styles';
    const modulePath = path.resolve(
      path.dirname(pagePath),
      importMatch?.[2] ?? './page.module.css',
    );
    expect(existsSync(modulePath)).toBe(true);

    const moduleSource = existsSync(modulePath) ? readFileSync(modulePath, 'utf8') : '';
    expect(/^[\t ]*\.[\w-]+\s*\{/m.test(moduleSource)).toBe(true);
    expect(new RegExp(`\\b${moduleAlias}\\.[A-Za-z_]\\w*`).test(pageSource)).toBe(true);
  });
});
