import {
  PRICE_INPUT_MESSAGE,
  parseSolesToCents,
  priceCentsSchema,
  productCategorySchema,
  productNameSchema,
} from '@polleria/shared';
import type { ProductCategory } from '@polleria/shared';

/** Valor inicial del campo Precio para un precio guardado: 1400 -> '14.00'. */
export function solesFieldValue(priceCents: number): string {
  return (priceCents / 100).toFixed(2);
}

/** Texto del campo Precio -> céntimos válidos para la API; null si no cuadra (PRICE_INPUT_MESSAGE). */
export function priceFieldCents(text: string): number | null {
  const cents = parseSolesToCents(text);
  if (cents === null || !priceCentsSchema.safeParse(cents).success) return null;
  return cents;
}

export interface ProductFieldValues {
  name: string;
  category: ProductCategory;
  priceCents: number;
}
export interface ProductFieldErrors {
  name?: string;
  category?: string;
  price?: string;
}
export interface ProductFieldsResult {
  values: ProductFieldValues | null;
  errors: ProductFieldErrors;
}

/**
 * Validación local del formulario de producto (alta y edición, D-008-05/06): nombre
 * con productNameSchema (su mensaje único), categoría elegida ('Elige una categoría.')
 * y precio en soles convertido a céntimos dentro del rango del esquema
 * (PRICE_INPUT_MESSAGE). Devuelve los valores listos para el cuerpo o los errores
 * por campo.
 */
export function validateProductFields(
  name: string,
  category: string,
  priceText: string,
): ProductFieldsResult {
  const errors: ProductFieldErrors = {};
  const nameParsed = productNameSchema.safeParse(name);
  if (!nameParsed.success) errors.name = nameParsed.error.issues[0]?.message;
  const categoryParsed = productCategorySchema.safeParse(category);
  if (!categoryParsed.success) errors.category = 'Elige una categoría.';
  const priceCents = priceFieldCents(priceText);
  if (priceCents === null) errors.price = PRICE_INPUT_MESSAGE;
  if (!nameParsed.success || !categoryParsed.success || priceCents === null) {
    return { values: null, errors };
  }
  return {
    values: { name: nameParsed.data, category: categoryParsed.data, priceCents },
    errors,
  };
}
