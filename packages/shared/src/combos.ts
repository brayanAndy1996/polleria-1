import { z } from 'zod';
import { productSchema } from './products.ts';
import {
  PORTIONS,
  PORTION_CUT_MESSAGE,
  SINGLE_CUT_PORTIONS,
  chickenConsumption,
  cutSchema,
  portionSchema,
} from './portions.ts';
import type { ChickenConsumption, Cut, Portion } from './portions.ts';

/**
 * Componentes de un combo (spec 007, D-007-03): cada fila de combo_items dice "este
 * combo lleva quantity unidades de este producto (con esta presentación y parte, si el
 * producto es pollo)". El combo es un producto más de la carta, de la categoría 'combo'
 * (D-007-02), y cobra su propio price_cents: los componentes no llevan precio dentro
 * del combo (D-007-05).
 */

/** Tope de componentes por combo (D-007-06, S-007-10): los combos reales llevan 2 a 6. */
export const COMBO_ITEMS_MAX = 10;
/**
 * Unidades máximas del mismo componente (S-007-10): para el pollo multiplica los
 * octavos de la presentación (un entero x2 = 16 octavos, combo de dos pollos, válido).
 */
export const COMBO_ITEM_QUANTITY_MAX = 99;

const PRODUCT_ID_MESSAGE = 'El identificador del producto no es válido.';
const QUANTITY_MESSAGE = 'Indica cuántas unidades lleva este componente.';
export const CUT_WITHOUT_PORTION_MESSAGE = 'Sin presentación no se puede indicar la parte.';
const ITEMS_MAX_MESSAGE = 'Un combo admite hasta 10 componentes.';
const ITEMS_DUPLICATED_MESSAGE = 'Hay componentes repetidos en la lista.';

/** Máximo del tipo INTEGER de PostgreSQL (misma regla que el productId de la ruta). */
const PRODUCT_ID_MAX = 2147483647;

/**
 * Una fila del PUT de componentes (D-007-06, AC-02): productId y quantity obligatorios;
 * portion y cut son nullish y se normalizan a null. Objeto estricto: una propiedad de
 * más es error de quien llama.
 *
 * La correspondencia presentación-parte es la misma de la 006 (eighth y quarter exigen
 * breast o leg; half y whole no llevan parte) y sin presentación no se puede indicar
 * parte; ambas caen en `cut`. Que el componente deba o no llevar presentación según la
 * categoría del producto es regla del servicio (D-007-10), no del esquema.
 */
export const comboItemInputSchema = z
  .strictObject({
    productId: z
      .number({ error: PRODUCT_ID_MESSAGE })
      .int(PRODUCT_ID_MESSAGE)
      .min(1, PRODUCT_ID_MESSAGE)
      .max(PRODUCT_ID_MAX, PRODUCT_ID_MESSAGE),
    quantity: z
      .number({ error: QUANTITY_MESSAGE })
      .int(QUANTITY_MESSAGE)
      .min(1, QUANTITY_MESSAGE)
      .max(COMBO_ITEM_QUANTITY_MAX, QUANTITY_MESSAGE),
    portion: portionSchema.nullish().transform((value) => value ?? null),
    cut: cutSchema.nullish().transform((value) => value ?? null),
  })
  // Primero la regla de la parte suelta: cut presente sin portion es su propio mensaje.
  .refine((row) => !(row.portion === null && row.cut !== null), {
    error: CUT_WITHOUT_PORTION_MESSAGE,
    path: ['cut'],
  })
  // La correspondencia solo se evalúa sobre presentaciones de la lista: un valor fuera
  // de PORTIONS ya lo rechaza el enum con su propio issue.
  .refine(
    (row) => {
      if (row.portion === null || !(PORTIONS as readonly string[]).includes(row.portion))
        return true;
      const singleCut = (SINGLE_CUT_PORTIONS as readonly string[]).includes(row.portion);
      return singleCut ? row.cut !== null : row.cut === null;
    },
    { error: PORTION_CUT_MESSAGE, path: ['cut'] },
  );
export type ComboItemInput = z.infer<typeof comboItemInputSchema>;

/**
 * Refino de unicidad de la lista de componentes (AC-03): dos filas con el mismo
 * (productId, portion, cut) cuentan como repetidas aunque vengan separadas o con
 * portion/cut omitidos (ya normalizados a null). El issue cae en `items.N` con el
 * índice de la segunda aparición. El mismo producto con distinta (portion, cut) —el
 * "dúo": cuarto pecho + cuarto pierna del mismo pollo— es válido.
 */
export function comboItemsUniqueRefinement(
  value: { items: ComboItemInput[] },
  ctx: z.RefinementCtx,
): void {
  if (!Array.isArray(value.items)) return;
  const seen = new Set<string>();
  value.items.forEach((item, index) => {
    if (typeof item !== 'object' || item === null) return;
    const key = `${String(item.productId)}|${String(item.portion)}|${String(item.cut)}`;
    if (seen.has(key)) {
      ctx.addIssue({
        code: 'custom',
        path: ['items', index],
        message: ITEMS_DUPLICATED_MESSAGE,
      });
    } else {
      seen.add(key);
    }
  });
}

/**
 * Cuerpo de PUT /api/products/{productId}/items (D-007-06, AC-03): el conjunto completo
 * que reemplaza lo que haya — de 0 a COMBO_ITEMS_MAX filas y sin repetidos. La lista
 * vacía deja el combo sin componentes (se vende como ítem simple, D-007-12).
 */
export const replaceComboItemsRequestSchema = z
  .strictObject({
    items: z.array(comboItemInputSchema).max(COMBO_ITEMS_MAX, ITEMS_MAX_MESSAGE),
  })
  .superRefine(comboItemsUniqueRefinement);
export type ReplaceComboItemsRequest = z.infer<typeof replaceComboItemsRequestSchema>;

/**
 * Un componente tal como lo devuelve la API (D-007-09): exactamente estas seis claves,
 * con el producto componente embebido con sus cinco claves de la 005 —leídas al
 * momento— y portion/cut null en los componentes que no son pollo. Nunca createdAt ni
 * updatedAt: los id de las filas no son estables entre PUTs (RN-007-08).
 */
export const comboItemSchema = z.strictObject({
  id: z.number().int().positive(),
  comboId: z.number().int().positive(),
  product: productSchema,
  quantity: z.number().int().min(1).max(COMBO_ITEM_QUANTITY_MAX),
  portion: portionSchema.nullable(),
  cut: cutSchema.nullable(),
});
export type ComboItem = z.infer<typeof comboItemSchema>;

/** Respuesta de GET y PUT /api/products/{productId}/items: la lista ordenada (D-007-09). */
export const comboItemsResponseSchema = z.strictObject({
  items: z.array(comboItemSchema),
});
export type ComboItemsResponse = z.infer<typeof comboItemsResponseSchema>;

/** Forma mínima de ítem que consume comboChickenConsumption (sección 8.3). */
export interface ComboConsumptionItem {
  quantity: number;
  portion: Portion | null;
  cut: Cut | null;
}

/**
 * Consumo de pollo de un combo en octavos (D-007-13, RN-007-06): suma por ítem
 * `quantity × chickenConsumption(portion, cut)` de los componentes con presentación
 * (los de pollo); los que no son pollo tienen portion null y aportan 0 —su consumo es
 * por unidades o insumos, Fase 5. No se guarda nada: se deriva, igual que en la 006.
 * Lanza error ante un cut sin portion (defensa propia) o una combinación inválida
 * (delegada a chickenConsumption), igual que los datos que el servicio ya impide.
 *
 * El parámetro acepta únicamente iterables (sección 8.3, y la simplificación
 * autorizada por la spec 010, §12, por recomendación de ADV-007-06): un ítem suelto
 * no es iterable y lanza TypeError, como piden los casos de lanzamiento de AC-05.
 */
export function comboChickenConsumption(items: Iterable<ComboConsumptionItem>): ChickenConsumption {
  let breastEighths = 0;
  let legEighths = 0;
  for (const item of items) {
    if (item.portion === null) {
      // Sin presentación no se puede indicar la parte: el servicio lo impide al
      // escribir; aquí es defensa ante datos forzados (sección 8.3).
      if (item.cut != null) throw new Error(CUT_WITHOUT_PORTION_MESSAGE);
      continue;
    }
    const consumption = chickenConsumption(item.portion, item.cut);
    breastEighths += consumption.breastEighths * item.quantity;
    legEighths += consumption.legEighths * item.quantity;
  }
  return { breastEighths, legEighths };
}
