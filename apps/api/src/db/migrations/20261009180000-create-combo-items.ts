import type { QueryInterface } from 'sequelize';

/**
 * Tabla combo_items (spec 007, D-007-03 y sección 8.1): los componentes de cada combo —
 * "este combo lleva quantity unidades de este producto (con esta presentación y parte
 * si el componente es pollo)". Las restricciones viven en la base y no solo en Zod
 * (D-003-14):
 * - combo_items_quantity_range: de 1 a 99 unidades por componente (S-007-10).
 * - combo_items_portion_allowed y combo_items_cut_allowed: la presentación solo puede
 *   ser una de PORTIONS y la parte una de CUTS (listas de la 006).
 * - combo_items_portion_cut: la correspondencia —ambos NULL (componente que no es
 *   pollo), o eighth/quarter con breast/leg, o half/whole con cut NULL— igual que
 *   product_portions_cut_matches_portion de la 006.
 * - combo_items_unique: una sola fila por (combo, producto, presentación, parte); el
 *   NULLS NOT DISTINCT trata los NULL como iguales y da índice directo al
 *   ON CONFLICT DO UPDATE del PUT (D-007-06).
 * - combo_items_combo_id y combo_items_product_id: consulta por combo y la guardia
 *   "¿este producto es componente de algún combo?" (PRODUCT_IS_COMPONENT).
 * La base no sabe la categoría del producto referenciado: "componente de pollo ⇒
 * portion obligatoria", "no pollo ⇒ portion NULL" y "un combo nunca es componente" son
 * reglas del servicio (D-007-10); la tabla solo garantiza la forma de la fila.
 * Sin ON DELETE: los productos no se borran nunca (RN-005-10), igual que en
 * product_portions.
 *
 * La misma transacción amplía el CHECK products_category_allowed con 'combo' en segundo
 * lugar, después del pollo (D-007-02): en las cartas de pollería los combos van junto
 * al pollo.
 */
export async function up({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.transaction(async (transaction) => {
    await context.sequelize.query(
      `
      CREATE TABLE combo_items (
        id SERIAL PRIMARY KEY,
        combo_id INTEGER NOT NULL REFERENCES products(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        quantity INTEGER NOT NULL
          CONSTRAINT combo_items_quantity_range CHECK (quantity BETWEEN 1 AND 99),
        portion VARCHAR(8)
          CONSTRAINT combo_items_portion_allowed CHECK (
            portion IN ('eighth', 'quarter', 'half', 'whole')
          ),
        cut VARCHAR(8)
          CONSTRAINT combo_items_cut_allowed CHECK (cut IN ('breast', 'leg')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        -- Un CHECK solo rechaza cuando evalúa a FALSE: con OR/AND y un portion NULL la
        -- expresión puede dar NULL y la fila pasaría. El CASE devuelve siempre booleano
        -- y además no compite con portion_allowed/cut_allowed: los valores fuera de la
        -- lista caen en ELSE TRUE y quien reporta es el CHECK de la lista.
        CONSTRAINT combo_items_portion_cut CHECK (
          CASE
            WHEN portion IS NULL THEN cut IS NULL
            WHEN portion IN ('eighth', 'quarter') THEN cut IS NOT NULL
            WHEN portion IN ('half', 'whole') THEN cut IS NULL
            ELSE TRUE
          END
        ),
        CONSTRAINT combo_items_unique
          UNIQUE NULLS NOT DISTINCT (combo_id, product_id, portion, cut)
      )
    `,
      { transaction },
    );
    await context.sequelize.query('CREATE INDEX combo_items_combo_id ON combo_items (combo_id)', {
      transaction,
    });
    await context.sequelize.query(
      'CREATE INDEX combo_items_product_id ON combo_items (product_id)',
      { transaction },
    );
    // La categoría 'combo' entra en segundo lugar, después de 'chicken' (D-007-02).
    await context.sequelize.query(
      'ALTER TABLE products DROP CONSTRAINT products_category_allowed',
      { transaction },
    );
    await context.sequelize.query(
      `ALTER TABLE products ADD CONSTRAINT products_category_allowed CHECK (
         category IN ('chicken', 'combo', 'dish', 'drink', 'dessert', 'sauce', 'extra')
       )`,
      { transaction },
    );
  });
}

export async function down({ context }: { context: QueryInterface }): Promise<void> {
  // Revertir pierde los componentes cargados y restaura el CHECK sin 'combo': con un
  // producto 'combo' dado de alta el down falla al restaurarlo (D-007-14). Revertir es
  // solo para desarrollo, como el resto de las migraciones.
  await context.sequelize.transaction(async (transaction) => {
    await context.dropTable('combo_items', { transaction });
    await context.sequelize.query(
      'ALTER TABLE products DROP CONSTRAINT products_category_allowed',
      { transaction },
    );
    await context.sequelize.query(
      `ALTER TABLE products ADD CONSTRAINT products_category_allowed CHECK (
         category IN ('chicken', 'dish', 'drink', 'dessert', 'sauce', 'extra')
       )`,
      { transaction },
    );
  });
}
