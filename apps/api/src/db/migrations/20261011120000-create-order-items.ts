import type { QueryInterface } from 'sequelize';

/**
 * Ítems del pedido, comandas de cocina y claves de idempotencia (spec 010, D-010-08
 * y sección 8). kitchen_tickets agrupa los ítems de cada envío o anulación y es la
 * fila que la comanda impresa representa; order_items congela nombre, categoría y
 * precio al enviar (regla 4) y guarda la traza completa de anulación (regla 6);
 * order_item_components y order_item_sauces son sus hijas; idempotency_keys hace
 * reintento-seguras las cuatro operaciones de escritura (regla 5).
 *
 * Orden de creación por las FK: kitchen_tickets antes que order_items, y order_items
 * antes que sus hijas. En el down, el orden inverso.
 *
 * Las restricciones viven en la base y no solo en Zod (D-003-14):
 * - kitchen_tickets_kind_allowed: solo los tres tipos de comanda.
 * - order_items_quantity_range / price_cents_range: las cotas del ítem.
 * - order_items_portion_cut: un solo CHECK cubre valores y correspondencia —
 *   (ambos NULL) o (eighth/quarter con parte válida) o (half/whole sin parte);
 *   cualquier otra combinación, incluidos valores fuera de lista, cae aquí. Se
 *   repite igual en order_item_components.
 * - order_items_status_allowed: los tres estados del ítem.
 * - order_items_void_consistent: 'sent' va sin rastro de anulación; 'void_requested'
 *   exige fecha, autor y motivo de la solicitud y prohíbe los de la aprobación;
 *   'voided' exige comanda, fecha, autor y motivo de anulación (la solicitud puede
 *   quedar conservada o no).
 * - idempotency_keys_scope_key_unique: un par (scope, key) se registra una vez.
 *
 * FKs de order_items: orders, products, kitchen_tickets (envío y anulación),
 * tables (mesa de origen) y users (created_by, void_requested_by y voided_by).
 * Sin ON DELETE: pedidos, ítems y comandas son historial que nunca se borra.
 */
export async function up({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.transaction(async (transaction) => {
    await context.sequelize.query(
      `
      CREATE TABLE kitchen_tickets (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        kind VARCHAR(12) NOT NULL
          CONSTRAINT kitchen_tickets_kind_allowed CHECK (
            kind IN ('initial', 'additional', 'void')
          ),
        created_by_user_id INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,
      { transaction },
    );
    await context.sequelize.query(
      'CREATE INDEX kitchen_tickets_order_id ON kitchen_tickets (order_id)',
      { transaction },
    );

    await context.sequelize.query(
      `
      CREATE TABLE order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        product_name VARCHAR(60) NOT NULL,
        product_category VARCHAR(16) NOT NULL,
        quantity INTEGER NOT NULL
          CONSTRAINT order_items_quantity_range CHECK (quantity BETWEEN 1 AND 99),
        price_cents INTEGER NOT NULL
          CONSTRAINT order_items_price_cents_range CHECK (
            price_cents BETWEEN 0 AND 999999
          ),
        portion VARCHAR(8),
        cut VARCHAR(8),
        breast_eighths INTEGER NOT NULL DEFAULT 0
          CONSTRAINT order_items_breast_eighths_range CHECK (breast_eighths >= 0),
        leg_eighths INTEGER NOT NULL DEFAULT 0
          CONSTRAINT order_items_leg_eighths_range CHECK (leg_eighths >= 0),
        notes VARCHAR(200),
        status VARCHAR(16) NOT NULL DEFAULT 'sent'
          CONSTRAINT order_items_status_allowed CHECK (
            status IN ('sent', 'void_requested', 'voided')
          ),
        kitchen_ticket_id INTEGER NOT NULL REFERENCES kitchen_tickets(id),
        void_ticket_id INTEGER REFERENCES kitchen_tickets(id),
        void_requested_at TIMESTAMPTZ,
        void_requested_by_user_id INTEGER REFERENCES users(id),
        void_request_reason VARCHAR(200),
        voided_at TIMESTAMPTZ,
        voided_by_user_id INTEGER REFERENCES users(id),
        void_reason VARCHAR(200),
        ordered_at_table_id INTEGER REFERENCES tables(id),
        created_by_user_id INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        -- Un solo CHECK cubre valores y correspondencia (los valores fuera de lista
        -- caen también aquí). El CASE devuelve siempre booleano: un OR con NULL
        -- evaluaría a NULL y la fila pasaría (lección del combo_items_portion_cut).
        CONSTRAINT order_items_portion_cut CHECK (
          CASE
            WHEN portion IS NULL THEN cut IS NULL
            WHEN portion IN ('eighth', 'quarter') THEN (
              cut IS NOT NULL AND cut IN ('breast', 'leg')
            )
            WHEN portion IN ('half', 'whole') THEN cut IS NULL
            ELSE FALSE
          END
        ),
        CONSTRAINT order_items_void_consistent CHECK (
          (status = 'sent'
            AND void_requested_at IS NULL
            AND void_requested_by_user_id IS NULL
            AND void_request_reason IS NULL
            AND void_ticket_id IS NULL
            AND voided_at IS NULL
            AND voided_by_user_id IS NULL
            AND void_reason IS NULL)
          OR (status = 'void_requested'
            AND void_requested_at IS NOT NULL
            AND void_requested_by_user_id IS NOT NULL
            AND void_request_reason IS NOT NULL
            AND void_ticket_id IS NULL
            AND voided_at IS NULL
            AND voided_by_user_id IS NULL
            AND void_reason IS NULL)
          OR (status = 'voided'
            AND void_ticket_id IS NOT NULL
            AND voided_at IS NOT NULL
            AND voided_by_user_id IS NOT NULL
            AND void_reason IS NOT NULL)
        )
      )
    `,
      { transaction },
    );
    for (const index of [
      'CREATE INDEX order_items_order_id ON order_items (order_id)',
      'CREATE INDEX order_items_product_id ON order_items (product_id)',
      'CREATE INDEX order_items_kitchen_ticket_id ON order_items (kitchen_ticket_id)',
      'CREATE INDEX order_items_ordered_at_table_id ON order_items (ordered_at_table_id)',
    ])
      await context.sequelize.query(index, { transaction });

    await context.sequelize.query(
      `
      CREATE TABLE order_item_components (
        id SERIAL PRIMARY KEY,
        order_item_id INTEGER NOT NULL REFERENCES order_items(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        product_name VARCHAR(60) NOT NULL,
        quantity INTEGER NOT NULL
          CONSTRAINT order_item_components_quantity_range CHECK (
            quantity BETWEEN 1 AND 99
          ),
        portion VARCHAR(8),
        cut VARCHAR(8),
        breast_eighths INTEGER NOT NULL DEFAULT 0
          CONSTRAINT order_item_components_breast_eighths_range CHECK (
            breast_eighths >= 0
          ),
        leg_eighths INTEGER NOT NULL DEFAULT 0
          CONSTRAINT order_item_components_leg_eighths_range CHECK (leg_eighths >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT order_item_components_portion_cut CHECK (
          CASE
            WHEN portion IS NULL THEN cut IS NULL
            WHEN portion IN ('eighth', 'quarter') THEN (
              cut IS NOT NULL AND cut IN ('breast', 'leg')
            )
            WHEN portion IN ('half', 'whole') THEN cut IS NULL
            ELSE FALSE
          END
        )
      )
    `,
      { transaction },
    );
    await context.sequelize.query(
      'CREATE INDEX order_item_components_order_item_id ' +
        'ON order_item_components (order_item_id)',
      { transaction },
    );

    await context.sequelize.query(
      `
      CREATE TABLE order_item_sauces (
        id SERIAL PRIMARY KEY,
        order_item_id INTEGER NOT NULL REFERENCES order_items(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        product_name VARCHAR(60) NOT NULL,
        quantity INTEGER NOT NULL
          CONSTRAINT order_item_sauces_quantity_range CHECK (quantity BETWEEN 1 AND 99),
        price_cents INTEGER NOT NULL
          CONSTRAINT order_item_sauces_price_cents_range CHECK (
            price_cents BETWEEN 0 AND 999999
          ),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,
      { transaction },
    );
    await context.sequelize.query(
      'CREATE INDEX order_item_sauces_order_item_id ON order_item_sauces (order_item_id)',
      { transaction },
    );

    await context.sequelize.query(
      `
      CREATE TABLE idempotency_keys (
        id SERIAL PRIMARY KEY,
        scope VARCHAR(32) NOT NULL,
        key VARCHAR(128) NOT NULL,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        request_hash VARCHAR(64) NOT NULL,
        response_status SMALLINT NOT NULL,
        response_body JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT idempotency_keys_scope_key_unique UNIQUE (scope, key)
      )
    `,
      { transaction },
    );
  });
}

export async function down({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.transaction(async (transaction) => {
    // Hijas primero, luego order_items y al final kitchen_tickets e idempotency_keys:
    // el orden inverso al del up respeta las FK entre ellas.
    for (const table of [
      'order_item_sauces',
      'order_item_components',
      'order_items',
      'idempotency_keys',
      'kitchen_tickets',
    ])
      await context.sequelize.query(`DROP TABLE ${table}`, { transaction });
  });
}
