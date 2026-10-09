import { z } from 'zod';

/**
 * Categorías fijas de la carta (D-005-03, ampliada por D-007-02), en el orden en que se
 * muestran: Pollo, Combos, Platos, Bebidas, Postres, Cremas y Extras. La base las
 * garantiza con un CHECK; agregar una categoría es una migración y un cambio de esta
 * lista. 'combo' entró en segundo lugar en la spec 007: en las cartas de pollería los
 * combos y promociones van junto al pollo.
 */
export const PRODUCT_CATEGORIES = [
  'chicken',
  'combo',
  'dish',
  'drink',
  'dessert',
  'sauce',
  'extra',
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];
export const productCategorySchema = z.enum(PRODUCT_CATEGORIES);

export const PRODUCT_NAME_MAX_LENGTH = 60;
/**
 * Nombre del producto (D-005-06): empieza con letra o número y permite letras con tilde,
 * números, espacios y los signos punto, coma, apóstrofo, paréntesis, barra, porcentaje,
 * más o guion. Cubre "1/4 de Pollo", "Inca Kola 1.5 L", "Chicha Morada (jarra)" y
 * "Papas + queso"; no admite tabulaciones, emojis ni espacios duros en medio.
 */
export const PRODUCT_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} .,'()/%+-]*$/u;
export const PRODUCT_NAME_MESSAGE =
  'Usa de 1 a 60 caracteres: letras, números, espacios y los signos punto, coma, ' +
  'apóstrofo, paréntesis, barra, porcentaje, más o guion; empieza con letra o número.';
/**
 * Mismo estilo que displayNameSchema (spec 003): recorta los bordes, normaliza a NFC y
 * valida largo y patrón con un único mensaje. El `error` de la primera capa hace que una
 * entrada que no es texto también reciba el mensaje único.
 */
export const productNameSchema = z
  .string({ error: PRODUCT_NAME_MESSAGE })
  .trim()
  .transform((value) => value.normalize('NFC'))
  .pipe(
    z
      .string()
      .min(1, PRODUCT_NAME_MESSAGE)
      .max(PRODUCT_NAME_MAX_LENGTH, PRODUCT_NAME_MESSAGE)
      .regex(PRODUCT_NAME_PATTERN, PRODUCT_NAME_MESSAGE),
  );

/** Tope del precio en céntimos: S/ 999.99 (D-005-05). 0 es válido (cremas gratis). */
export const PRICE_CENTS_MAX = 99999;
const PRICE_CENTS_MESSAGE = 'El precio debe ser un número entero de céntimos entre 0 y 99999.';
/**
 * Precio en céntimos de sol como entero (regla de dominio 2, D-005-05): entre 0 y
 * PRICE_CENTS_MAX. Rechaza decimales (18.5), texto ('1850'), NaN e Infinity con el
 * mismo mensaje único.
 */
export const priceCentsSchema = z
  .number({ error: PRICE_CENTS_MESSAGE })
  .int(PRICE_CENTS_MESSAGE)
  .min(0, PRICE_CENTS_MESSAGE)
  .max(PRICE_CENTS_MAX, PRICE_CENTS_MESSAGE);

/** Cuerpo de POST /api/products: alta de un producto, que siempre nace activo (RN-005-09). */
export const createProductRequestSchema = z.strictObject({
  name: productNameSchema,
  category: productCategorySchema,
  priceCents: priceCentsSchema,
});
export type CreateProductRequest = z.infer<typeof createProductRequestSchema>;

/**
 * Cuerpo de PATCH /api/products/{productId}: nombre, categoría, precio y estado activo,
 * todos opcionales pero con al menos una propiedad ('No indicaste ningún cambio.'),
 * como updateUserRequestSchema de la 004. isActive false desactiva y true reactiva;
 * un producto nunca se borra (RN-005-04).
 */
export const updateProductRequestSchema = z
  .strictObject({
    name: productNameSchema.optional(),
    category: productCategorySchema.optional(),
    priceCents: priceCentsSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (fields) => Object.values(fields).some((value) => value !== undefined),
    'No indicaste ningún cambio.',
  );
export type UpdateProductRequest = z.infer<typeof updateProductRequestSchema>;

/**
 * Un producto tal como lo devuelve la API: exactamente estas cinco claves, nunca
 * createdAt ni updatedAt (D-005-02).
 */
export const productSchema = z.strictObject({
  id: z.number().int().positive(),
  name: productNameSchema,
  category: productCategorySchema,
  priceCents: priceCentsSchema,
  isActive: z.boolean(),
});
export type Product = z.infer<typeof productSchema>;

/**
 * Respuesta de GET /api/products: la carta completa —activos e inactivos— en el orden
 * de D-005-04 (categoría, nombre en español sin distinguir mayúsculas ni tildes, id).
 */
export const productsResponseSchema = z.strictObject({ products: z.array(productSchema) });
export type ProductsResponse = z.infer<typeof productsResponseSchema>;
