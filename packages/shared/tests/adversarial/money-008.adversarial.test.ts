import { describe, expect, it } from 'vitest';
import { formatSoles, parseSolesToCents } from '../../src/index.ts';

/**
 * Ataques a las funciones de dinero de la spec 008 (regla de dominio 2: el dinero
 * nunca es float ni NaN). Los casos de AC-01/AC-02 ya están cubiertos en
 * packages/shared/src/money.test.ts; aquí van las entradas hostiles que faltan:
 * separadores mezclados, signos, dígitos Unicode, notaciones alternativas,
 * desbordes de precisión y entradas fuera del tipo declarado.
 */
describe('008-adversarial: dinero en la interfaz (money.ts)', () => {
  it.each([
    ['18,50.25'],
    ['18.50,25'],
    ['+18'],
    ['+18.50'],
    ['-0'],
    ['-18.50'],
    ['18.'],
    ['.5'],
    [',5'],
    ['18..50'],
    ['18,,50'],
    ['18,5,0'],
    ['18.5.0'],
    ['S/ 18.50'],
    ['s/18.50'],
    ['S/. 18.50'],
    ['1 850'],
    ['18 50'],
    ['18 50'],
    ['1e5'],
    ['0x12'],
    ['0b101'],
    ['Infinity'],
    ['NaN'],
    ['true'],
    ['null'],
    ['undefined'],
    ['\u0661\u0668.\u0665\u0660'],
    ['\uFF11\uFF12.\uFF15\uFF10'],
    ['12\u066B50'],
    ['18\r50'],
    ['18\n50'],
    ['18\t50'],
    ['.'],
    [','],
    ['-.5'],
    ['-.'],
  ])('ADV-008-01: parseSolesToCents(%j) devuelve null', (text) => {
    expect(parseSolesToCents(text)).toBeNull();
  });

  it.each([
    ['007', 700],
    ['000', 0],
    ['0.5', 50],
    ['0,5', 50],
    ['00.50', 50],
    ['\t18.50\n', 1850],
    [' 18.50 ', 1850],
    ['999999', 99999900],
    ['99999.99', 9999999],
  ])('ADV-008-01: parseSolesToCents(%j) devuelve el entero %i', (text, expected) => {
    const cents = parseSolesToCents(text);
    expect(cents).toBe(expected);
    expect(Number.isSafeInteger(cents)).toBe(true);
  });

  it('ADV-008-02: parseSolesToCents devuelve Infinity ante un texto de 400 dígitos', () => {
    // El regex solo exige dígitos: parseInt desborda a Infinity con entradas
    // monstruosas y la función incumple su contrato ("entero de céntimos o null").
    // La web está a salvo porque priceCentsSchema rechaza el rango, pero el
    // contrato de la función pura queda roto para quien la reutilice.
    const result = parseSolesToCents('9'.repeat(400));
    expect(result === null || (typeof result === 'number' && Number.isFinite(result))).toBe(true);
    // Misma vía con decimales.
    const withDecimals = parseSolesToCents(`${'9'.repeat(400)}.99`);
    expect(
      withDecimals === null || (typeof withDecimals === 'number' && Number.isFinite(withDecimals)),
    ).toBe(true);
  });

  it('ADV-008-02: parseSolesToCents pierde precisión más allá de 2^53 (documentado)', () => {
    // '99999999999999.99' en céntimos debería dar 9999999999999999 — valor que
    // ni siquiera es representable como double (redondea a 1e16). El resultado
    // sigue siendo un entero (nunca float) y queda fuera del rango del esquema
    // de precios, así que se documenta el límite práctico de la función.
    const cents = parseSolesToCents('99999999999999.99');
    expect(Number.isInteger(cents)).toBe(true);
    expect(Number.isSafeInteger(cents)).toBe(false);
    // Bajo el tope real (99999 céntimos = S/ 999.99) toda entrada es exacta:
    // cualquier texto que supere el rango produce al menos un valor mayor al tope.
    expect(cents).toBeGreaterThan(99999);
    // El mismo límite alcanzado por la parte entera (sin decimales).
    const huge = parseSolesToCents('99999999999999999');
    expect(Number.isSafeInteger(huge)).toBe(false);
    expect(Number.isInteger(huge)).toBe(true);
  });

  it.each([null, undefined, 18.5, NaN, ['18.50'], { text: '18.50' }])(
    'ADV-008-01: parseSolesToCents(%j) fuera del tipo lanza TypeError (defensa)',
    (input) => {
      expect(() => parseSolesToCents(input as never)).toThrow(TypeError);
    },
  );

  it('ADV-008-03: formatSoles rompe el formato "S/ X.XX" con céntimos de 1e23 o más', () => {
    // String() cambia a notación exponencial a partir de 1e21 en la parte de
    // soles: 'S/ 1.5e+21.04' llegaría a pantalla si algo pasa un entero enorme
    // (la comparación del combo puede producirlo con cantidades hostiles).
    for (const cents of [1e23, 1.5e23, 9.99e23]) {
      expect(formatSoles(cents)).toMatch(/^S\/ \d+\.\d{2}$/);
    }
  });

  it.each([Number.MAX_SAFE_INTEGER, 1e16, 999999999999999])(
    'ADV-008-03: formatSoles(%i) sigue en dígitos mientras los soles no llegan a 1e21',
    (cents) => {
      expect(formatSoles(cents)).toMatch(/^S\/ \d+\.\d{2}$/);
    },
  );

  it.each([new Number(1850), '1850', {}, []])(
    'ADV-008-03: formatSoles(%j) solo acepta number crudo y lanza',
    (input) => {
      expect(() => formatSoles(input as never)).toThrow();
    },
  );

  it('ADV-008-03: formatSoles(1850n) también lanza (no cuela otro entero)', () => {
    expect(() => formatSoles(BigInt(1850) as never)).toThrow();
  });

  it('ADV-008-41: el desborde de parseSolesToCents corta al cruzar el máximo double', () => {
    // La frontera depende del valor, no solo del largo: 307 dígitos en '1' aún
    // cabe (≈1.1e308 céntimos < 1.79e308, entero no seguro pero finito); en '2'
    // el mismo largo ya desborda a Infinity y devuelve null. Con 308 dígitos
    // cualquier valor excede el máximo double.
    const just = parseSolesToCents('1'.repeat(307));
    expect(Number.isInteger(just)).toBe(true);
    expect(Number.isSafeInteger(just)).toBe(false);
    expect(parseSolesToCents('2'.repeat(307))).toBeNull();
    expect(parseSolesToCents('9'.repeat(307))).toBeNull();
    expect(parseSolesToCents('1'.repeat(308))).toBeNull();
  });
});
