import { z } from 'zod';
import { priceCentsSchema } from './products.ts';

/**
 * Presentaciones fijas del pollo a la brasa (D-006-02), en el orden en que se muestran:
 * octavo, cuarto, medio y entero. Son fijas porque el glosario de CLAUDE.md ya las fija
 * y nadie vende "tres octavos" ni presentaciones inventadas.
 */
export const PORTIONS = ['eighth', 'quarter', 'half', 'whole'] as const;
export type Portion = (typeof PORTIONS)[number];
export const portionSchema = z.enum(PORTIONS);

/** Partes del trozado (D-006-02): pecho y pierna, en ese orden. */
export const CUTS = ['breast', 'leg'] as const;
export type Cut = (typeof CUTS)[number];
export const cutSchema = z.enum(CUTS);

/** Octavos que consume cada presentación (regla de dominio 1, literal). */
export const PORTION_EIGHTHS = { eighth: 1, quarter: 2, half: 4, whole: 8 } as const;

/** eighth y quarter llevan una sola parte (breast o leg); half y whole llevan ambas. */
export const SINGLE_CUT_PORTIONS = ['eighth', 'quarter'] as const;
export const MIXED_PORTIONS = ['half', 'whole'] as const;

/** Octavos de pecho y de pierna que consume una presentación (única fuente de verdad, RN-006-05). */
export interface ChickenConsumption {
  breastEighths: number;
  legEighths: number;
}

/**
 * Consumo en octavos de una presentación (D-006-04, regla de dominio 1):
 * - eighth y quarter consumen todos sus octavos de la parte indicada;
 * - half consume por defecto 2 de pecho + 2 de pierna y whole 4 + 4 (la distribución real
 *   que pida el cliente —por ejemplo "medio solo pierna"— se copiará en el ítem del
 *   pedido de la Fase 2, RN-006-08; la carta solo necesita la distribución por defecto).
 * Lanza error en combinaciones inválidas: eighth/quarter sin parte, half/whole con parte
 * o una presentación fuera de PORTIONS (aunque se fuerce el tipo).
 */
export function chickenConsumption(
  portion: Portion,
  cut: Cut | null | undefined,
): ChickenConsumption {
  if (!(PORTIONS as readonly string[]).includes(portion))
    throw new Error(`Presentación desconocida: ${String(portion)}.`);
  const eighths = PORTION_EIGHTHS[portion];
  if ((SINGLE_CUT_PORTIONS as readonly string[]).includes(portion)) {
    // eighth y quarter exigen una parte: sin ella la cocina no sabe qué trozar.
    if (cut === 'breast') return { breastEighths: eighths, legEighths: 0 };
    if (cut === 'leg') return { breastEighths: 0, legEighths: eighths };
    throw new Error(`La presentación ${portion} exige una parte: breast o leg.`);
  }
  // half y whole llevan ambas partes: indicar una no corresponde a la presentación.
  if (cut !== null && cut !== undefined)
    throw new Error(`La presentación ${portion} no lleva parte.`);
  return { breastEighths: eighths / 2, legEighths: eighths / 2 };
}

/**
 * Tope de filas por producto (D-006-06): son todas las combinaciones posibles —octavo
 * pecho, octavo pierna, cuarto pecho, cuarto pierna, medio y entero. Más de 6 implica
 * repetidos, que ya se rechazan.
 */
export const PRODUCT_PORTIONS_MAX = 6;
export const PORTION_CUT_MESSAGE =
  'La parte no corresponde a la presentación: eighth y quarter llevan breast o leg; ' +
  'half y whole no llevan parte.';
export const PORTIONS_DUPLICATED_MESSAGE = 'Hay presentaciones repetidas en la lista.';
const PORTIONS_MAX_MESSAGE = 'Un producto de pollo admite hasta 6 presentaciones.';

/**
 * Una fila del PUT de presentaciones: portion obligatoria de PORTIONS; cut obligatorio
 * (breast o leg) para eighth y quarter, y ausente o null para half y whole; priceCents
 * con el mismo rango de los productos (0..99999, regla 2). Objeto estricto: no lleva id
 * ni productId — el producto viene en la ruta (RN-006-04).
 */
export const productPortionInputSchema = z
  .strictObject({
    portion: portionSchema,
    cut: cutSchema.nullish(),
    priceCents: priceCentsSchema,
  })
  .refine((row) => {
    const singleCut = (SINGLE_CUT_PORTIONS as readonly string[]).includes(row.portion);
    return singleCut ? row.cut !== null && row.cut !== undefined : row.cut == null;
  }, PORTION_CUT_MESSAGE);
export type ProductPortionInput = z.infer<typeof productPortionInputSchema>;

/**
 * Cuerpo de PUT /api/products/{productId}/portions (D-006-06): el conjunto completo que
 * reemplaza lo que haya, de 0 a PRODUCT_PORTIONS_MAX filas y sin repetir (portion, cut)
 * — para half y whole el cut ausente y el null cuentan como el mismo valor.
 */
export const replaceProductPortionsRequestSchema = z
  .strictObject({
    portions: z.array(productPortionInputSchema).max(PRODUCT_PORTIONS_MAX, PORTIONS_MAX_MESSAGE),
  })
  .refine(
    ({ portions }) =>
      new Set(portions.map((row) => `${row.portion}:${row.cut ?? ''}`)).size === portions.length,
    PORTIONS_DUPLICATED_MESSAGE,
  );
export type ReplaceProductPortionsRequest = z.infer<typeof replaceProductPortionsRequestSchema>;

/**
 * Una presentación tal como la devuelve la API: exactamente estas cinco claves, con
 * cut null en las mixtas; nunca createdAt ni updatedAt (D-006-11).
 */
export const productPortionSchema = z.strictObject({
  id: z.number().int().positive(),
  productId: z.number().int().positive(),
  portion: portionSchema,
  cut: cutSchema.nullable(),
  priceCents: priceCentsSchema,
});
export type ProductPortion = z.infer<typeof productPortionSchema>;

/**
 * Respuesta de GET y PUT /api/products/{productId}/portions: las filas del producto en
 * el orden de D-006-11.
 */
export const productPortionsResponseSchema = z.strictObject({
  portions: z.array(productPortionSchema),
});
export type ProductPortionsResponse = z.infer<typeof productPortionsResponseSchema>;
