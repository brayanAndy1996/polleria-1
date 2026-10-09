import type { Cut, Portion, ProductCategory } from '@polleria/shared';

/**
 * Etiquetas de la carta en español (D-008-11): son interfaz, por eso viven en la web
 * igual que ROLE_LABELS. El orden de cada mapa es el de su enum en shared.
 */
export const PRODUCT_CATEGORY_LABELS: Readonly<Record<ProductCategory, string>> = {
  chicken: 'Pollo',
  combo: 'Combos',
  dish: 'Platos',
  drink: 'Bebidas',
  dessert: 'Postres',
  sauce: 'Cremas',
  extra: 'Extras',
};

export const PORTION_LABELS: Readonly<Record<Portion, string>> = {
  eighth: 'Octavo',
  quarter: 'Cuarto',
  half: 'Medio pollo',
  whole: 'Pollo entero',
};

export const CUT_LABELS: Readonly<Record<Cut, string>> = {
  breast: 'Pecho',
  leg: 'Pierna',
};

/**
 * Etiqueta de una fila de la grilla de presentaciones: 'Octavo — pecho' en las de una
 * parte (eighth/quarter con breast/leg) y solo la presentación en las mixtas
 * ('Medio pollo', 'Pollo entero', cut null).
 */
export function formatPortionCutLabel(portion: Portion, cut: Cut | null): string {
  if (cut === null) return PORTION_LABELS[portion];
  return `${PORTION_LABELS[portion]} — ${CUT_LABELS[cut].toLowerCase()}`;
}
