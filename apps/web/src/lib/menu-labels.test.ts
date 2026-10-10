import { describe, expect, it } from 'vitest';
import { CUTS, PORTIONS, PRODUCT_CATEGORIES } from '@polleria/shared';
import type { Cut, Portion, ProductCategory } from '@polleria/shared';
import {
  CUT_LABELS,
  PORTION_LABELS,
  PRODUCT_CATEGORY_LABELS,
  formatPortionCutLabel,
} from './menu-labels.ts';

describe('008: etiquetas de la carta en español', () => {
  it.each<[ProductCategory, string]>([
    ['chicken', 'Pollo'],
    ['combo', 'Combos'],
    ['dish', 'Platos'],
    ['drink', 'Bebidas'],
    ['dessert', 'Postres'],
    ['sauce', 'Cremas'],
    ['extra', 'Extras'],
  ])('AC-03: la categoría %s se muestra como "%s"', (category, label) => {
    expect(PRODUCT_CATEGORY_LABELS[category]).toBe(label);
  });
  it('AC-03: PRODUCT_CATEGORY_LABELS cubre todas las claves del enum sin sobrantes', () => {
    expect(Object.keys(PRODUCT_CATEGORY_LABELS).sort()).toEqual([...PRODUCT_CATEGORIES].sort());
  });
  it.each<[Portion, string]>([
    ['eighth', 'Octavo'],
    ['quarter', 'Cuarto'],
    ['half', 'Medio pollo'],
    ['whole', 'Pollo entero'],
  ])('AC-03: la presentación %s se muestra como "%s"', (portion, label) => {
    expect(PORTION_LABELS[portion]).toBe(label);
  });
  it('AC-03: PORTION_LABELS cubre todas las presentaciones del enum', () => {
    expect(Object.keys(PORTION_LABELS).sort()).toEqual([...PORTIONS].sort());
  });
  it.each<[Cut, string]>([
    ['breast', 'Pecho'],
    ['leg', 'Pierna'],
  ])('AC-03: la parte %s se muestra como "%s"', (cut, label) => {
    expect(CUT_LABELS[cut]).toBe(label);
  });
  it('AC-03: CUT_LABELS cubre todas las partes del enum', () => {
    expect(Object.keys(CUT_LABELS).sort()).toEqual([...CUTS].sort());
  });
  it.each<[Portion, Cut | null, string]>([
    ['eighth', 'breast', 'Octavo \u2014 pecho'],
    ['eighth', 'leg', 'Octavo \u2014 pierna'],
    ['quarter', 'breast', 'Cuarto \u2014 pecho'],
    ['quarter', 'leg', 'Cuarto \u2014 pierna'],
    ['half', null, 'Medio pollo'],
    ['whole', null, 'Pollo entero'],
  ])('AC-03: formatPortionCutLabel(%s, %s) devuelve "%s"', (portion, cut, label) => {
    expect(formatPortionCutLabel(portion, cut)).toBe(label);
  });
});
