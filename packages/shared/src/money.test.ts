import { describe, expect, it } from 'vitest';
import {
  PRICE_INPUT_MESSAGE,
  formatCashierSoles,
  formatSoles,
  parseSolesToCents,
} from '@polleria/shared';

describe('008: dinero en soles en la interfaz (shared)', () => {
  it.each([
    [1850, 'S/ 18.50'],
    [0, 'S/ 0.00'],
    [5, 'S/ 0.05'],
    [700, 'S/ 7.00'],
    [99999, 'S/ 999.99'],
  ])('AC-01: formatSoles(%i) devuelve "%s"', (cents, expected) => {
    expect(formatSoles(cents)).toBe(expected);
  });

  it.each([-1, 18.5, 0.5, NaN, Infinity, -Infinity, '1850', null, undefined])(
    'AC-01: formatSoles lanza error con %s (solo acepta enteros de céntimos >= 0)',
    (input) => {
      expect(formatSoles).toBeTypeOf('function');
      expect(() => formatSoles(input as never)).toThrow();
    },
  );

  it('AC-02: PRICE_INPUT_MESSAGE es el texto exacto del campo Precio', () => {
    expect(PRICE_INPUT_MESSAGE).toBe(
      'Escribe el precio en soles (por ejemplo 18.50). El m\u00E1ximo es S/ 999.99.',
    );
  });

  it.each([
    ['18', 1800],
    ['18.5', 1850],
    ['18.50', 1850],
    ['18,50', 1850],
    [' 18.50 ', 1850],
    ['0', 0],
    ['0.00', 0],
    ['0.05', 5],
    ['999.99', 99999],
  ])('AC-02: parseSolesToCents("%s") devuelve %i', (text, expected) => {
    expect(parseSolesToCents(text)).toBe(expected);
  });

  it.each(['', '  ', 'abc', '18,5,0', '18.50.0', '-1', '18.505', '.5', '18.', 'S/ 18.50', '1 850'])(
    'AC-02: parseSolesToCents("%s") devuelve null',
    (text) => {
      expect(parseSolesToCents).toBeTypeOf('function');
      expect(parseSolesToCents(text)).toBeNull();
    },
  );
});

describe('014: dinero de Caja en soles', () => {
  it.each([
    [2100, 'S/ 21,00'],
    [2150, 'S/ 21,50'],
    [900, 'S/ 9,00'],
    [5, 'S/ 0,05'],
  ])('AC-13: formatCashierSoles(%i) muestra "%s"', (cents, expected) => {
    expect(formatCashierSoles(cents)).toBe(expected);
  });

  it.each(['21.5', '21,5'])('AC-13: %s se interpreta exactamente como 2150 céntimos', (text) => {
    expect(parseSolesToCents(text)).toBe(2150);
    expect(formatCashierSoles(parseSolesToCents(text)!)).toBe('S/ 21,50');
  });

  it.each([-1, 21.5, NaN, Infinity, '2100', null])(
    'AC-13: formatCashierSoles rechaza un valor que no son céntimos enteros no negativos (%s)',
    (value) => expect(() => formatCashierSoles(value as never)).toThrow(),
  );
});
