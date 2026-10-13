import os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeDocumentLines } from './print-document.ts';
import { createPrinterService } from './printer.service.ts';
import { createFakeDriver } from '../../../tests/helpers/printer-fixtures.ts';

describe('013: normalización acotada para impresión', () => {
  afterEach(() => vi.restoreAllMocks());

  // Se observa la frontera nativa de NFC sin reemplazar su resultado. Así la
  // regresión comprueba trabajo ya acotado antes de reordenar marcas, aunque una
  // máquina rápida pase el benchmark. No exige una nueva función de producción.
  it.each([8, 9, 1999])(
    'AC-02: la secuencia de %i marcas llega a NFC con solo las primeras ocho',
    (count) => {
      const marks =
        '\u0344'.repeat(count > 8 ? 8 : count) + '\u0323'.repeat(Math.max(0, count - 8));
      const line = 'x' + marks;
      const input = Object.freeze([line]);
      const normalize = vi.spyOn(String.prototype, 'normalize');

      expect(normalizeDocumentLines(input)).toEqual(['x']);
      const nfcInputs = normalize.mock.calls.flatMap(([form], index) =>
        form === 'NFC' ? [String(normalize.mock.contexts[index])] : [],
      );
      expect(input).toEqual([line]);
      expect(nfcInputs).toContain('x' + '\u0344'.repeat(8));
      expect(
        nfcInputs
          .flatMap((text) => text.match(/\p{M}+/gu) ?? [])
          .every((run) => [...run].length <= 8),
      ).toBe(true);
    },
  );

  it('AC-02: cuenta Mn, Mc y Me por puntos Unicode y reinicia el límite después de un carácter no M', () => {
    // Mn suplementaria, Mc devanagari y Me encerradora: todas son categoría M.
    const eight = '\u{1d167}\u0903\u20dd'.repeat(2) + '\u0301\u0303';
    const input = Object.freeze(['x' + eight + '\u0344y' + eight + '\u0323']);
    const normalize = vi.spyOn(String.prototype, 'normalize');

    expect(normalizeDocumentLines(input)).toEqual(['xy']);
    const nfcInputs = normalize.mock.calls.flatMap(([form], index) =>
      form === 'NFC' ? [String(normalize.mock.contexts[index])] : [],
    );
    expect(nfcInputs).toContain('x' + eight + 'y' + eight);
    expect(input[0]).toBe('x' + eight + '\u0344y' + eight + '\u0323');
  });

  it.each([
    ['NFC habitual', 'cafe\u0301, n\u0303 y u\u0308', ['café, ñ y ü']],
    ['ASCII y sangría', '  - pollo', ['  - pollo']],
    ['sustitución tipográfica', '\u201Chola\u201D \u2014 \u2026', ['"hola" - ...']],
    ['NFKD ordinario', '\u00E0 \u00E7 \uFB01 m\u00B2', ['a c fi m2']],
    ['emoji y controles', 'pollo\u001b@ \u{1f357}', ['pollo@ ?']],
    ['saltos y corte de 48', 'x'.repeat(49) + '\r\ny', ['x'.repeat(48), 'x', 'y']],
  ] as const)('AC-02: conserva la salida ordinaria de la 002: %s', (_name, input, output) => {
    const lines = Object.freeze([input]);
    expect(normalizeDocumentLines(lines)).toEqual(output);
    expect(lines).toEqual([input]);
  });

  it('AC-02: conserva el benchmark original de dos impresiones aisladas de 500×2000 unidades, cada una bajo 2 s', async () => {
    const line = 'x' + '\u0344'.repeat(1000) + '\u0323'.repeat(999);
    expect(line.length).toBe(2000);
    const lines = Object.freeze(Array.from({ length: 500 }, () => line));
    const fake = createFakeDriver();
    const service = createPrinterService({ driver: fake.driver });
    const elapsedMs: number[] = [];

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const startedAt = performance.now();
      await service.print({ label: 'prueba', lines });
      elapsedMs.push(performance.now() - startedAt);
    }

    console.info('AC-02 benchmark', {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu: os.cpus()[0]?.model,
      elapsedMs,
    });
    expect(fake.jobs).toHaveLength(2);
    for (const job of fake.jobs) expect(job.lines).toEqual(Array.from({ length: 500 }, () => 'x'));
    expect(lines).toEqual(Array.from({ length: 500 }, () => line));
    expect(
      Math.max(...elapsedMs),
      `impresión/reimpresión: ${elapsedMs.join(', ')} ms`,
    ).toBeLessThan(2000);
  }, 120_000);
});
