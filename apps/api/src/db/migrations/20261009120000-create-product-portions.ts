import type { QueryInterface } from 'sequelize';

/**
 * Tabla product_portions (spec 006, D-006-03 y sección 8.1): las presentaciones en que se
 * vende cada producto de pollo (una fila por combinación presentación + parte, con su
 * precio). Las restricciones viven en la base y no solo en Zod (D-003-14):
 * - product_portions_portion_allowed: la presentación solo puede ser una de PORTIONS.
 * - product_portions_cut_allowed: la parte solo puede ser breast o leg.
 * - product_portions_price_cents_range: el precio es un entero de céntimos entre 0 y
 *   99999 (S/ 0.00 a S/ 999.99, regla 2).
 * - product_portions_cut_matches_portion: la parte es obligatoria en eighth y quarter y
 *   está prohibida en half y whole — llevan ambas partes (RN-006-04).
 * - product_portions_unique: una sola fila por (producto, presentación, parte); el
 *   NULLS NOT DISTINCT trata los cut NULL como iguales, así solo hay un 'half' y un
 *   'whole' por producto (PostgreSQL 15+).
 * - product_portions_product_id: índice no único sobre la clave foránea a products.
 * No hay is_active: una fila existe = se ofrece; el PUT la reemplaza borrando e
 * insertando (D-006-06) y nada la referencia (los pedidos copiarán los valores).
 */
export async function up({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.transaction(async (transaction) => {
    await context.sequelize.query(
      `
      CREATE TABLE product_portions (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id),
        portion VARCHAR(8) NOT NULL
          CONSTRAINT product_portions_portion_allowed CHECK (
            portion IN ('eighth', 'quarter', 'half', 'whole')
          ),
        cut VARCHAR(8)
          CONSTRAINT product_portions_cut_allowed CHECK (cut IN ('breast', 'leg')),
        price_cents INTEGER NOT NULL
          CONSTRAINT product_portions_price_cents_range CHECK (
            price_cents >= 0 AND price_cents <= 99999
          ),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT product_portions_cut_matches_portion CHECK (
          (portion IN ('eighth', 'quarter') AND cut IS NOT NULL)
          OR (portion IN ('half', 'whole') AND cut IS NULL)
        ),
        CONSTRAINT product_portions_unique
          UNIQUE NULLS NOT DISTINCT (product_id, portion, cut)
      )
    `,
      { transaction },
    );
    await context.sequelize.query(
      'CREATE INDEX product_portions_product_id ON product_portions (product_id)',
      { transaction },
    );
  });
}

export async function down({ context }: { context: QueryInterface }): Promise<void> {
  // Revertir pierde las presentaciones cargadas; solo para desarrollo (sección 8.1).
  await context.dropTable('product_portions');
}
