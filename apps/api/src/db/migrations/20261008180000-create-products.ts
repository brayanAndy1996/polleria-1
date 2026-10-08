import type { QueryInterface } from 'sequelize';

/**
 * Tabla products (spec 005, D-005-10 y sección 8.1): la carta. Las restricciones viven en
 * la base y no solo en Zod (D-003-14):
 * - products_name_valid: el nombre no puede ser vacío ni tener espacios en los bordes
 *   (el patrón completo —letras, números y signos— lo aplica productNameSchema).
 * - products_category_allowed: la categoría solo puede ser una de PRODUCT_CATEGORIES;
 *   agregar otra (por ejemplo 'combo' en la 007) es una migración que reemplaza el CHECK.
 * - products_price_cents_range: el precio es un entero de céntimos entre 0 y 99999
 *   (S/ 0.00 a S/ 999.99, regla 2).
 * - products_name_unique: índice único por expresión sobre lower(name): 'Chicha' y
 *   'chicha' son el mismo producto, activo o inactivo (D-005-06, RN-005-05).
 */
export async function up({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.transaction(async (transaction) => {
    await context.sequelize.query(
      `
      CREATE TABLE products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(60) NOT NULL
          CONSTRAINT products_name_valid CHECK (name <> '' AND name = btrim(name)),
        category VARCHAR(16) NOT NULL
          CONSTRAINT products_category_allowed CHECK (
            category IN ('chicken', 'dish', 'drink', 'dessert', 'sauce', 'extra')
          ),
        price_cents INTEGER NOT NULL
          CONSTRAINT products_price_cents_range CHECK (
            price_cents >= 0 AND price_cents <= 99999
          ),
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,
      { transaction },
    );
    await context.sequelize.query(
      'CREATE UNIQUE INDEX products_name_unique ON products (lower(name))',
      { transaction },
    );
  });
}

export async function down({ context }: { context: QueryInterface }): Promise<void> {
  await context.dropTable('products');
}
