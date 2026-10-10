import type { QueryInterface } from 'sequelize';

/**
 * Tablas orders y tables (spec 009, D-009-02, D-009-15 y sección 8). orders es la
 * cuenta abierta: su status recorre open -> closed/cancelled/merged y las marcas
 * ready y bill_requested conviven (la precedencia es solo una vista del salón).
 * tables es la configuración del salón con current_order_id, el puntero al pedido
 * que la cubre — varias mesas pueden apuntar al mismo pedido (mesa unida). Se crea
 * orders primero por la FK tables -> orders; en el down, tables primero.
 *
 * Las restricciones viven en la base y no solo en Zod (D-003-14):
 * - orders_status_allowed: solo los cuatro estados del ciclo.
 * - orders_closed_consistent: un pedido abierto no tiene rastro de cierre y uno no
 *   abierto lo tiene completo (fecha y autor juntos). Como status nunca es NULL la
 *   expresión nunca evalúa a NULL, así que no hace falta CASE.
 * - orders_cancel_reason: el motivo existe si y solo si el pedido está cancelado.
 * - orders_merged_consistent: el destino del merge existe si y solo si el pedido
 *   está fusionado; y orders_no_self_merge: nadie se fusiona consigo mismo.
 * - orders_ready_pair y orders_bill_pair: cada señal es un par fecha+autor — los
 *   dos puestos o ninguno. La comparación IS NULL = IS NULL siempre da booleano.
 * - tables_name_valid: el nombre no queda vacío ni con espacios en los bordes
 *   después del recorte (es el eco en base de la normalización de Zod).
 * - tables_name_unique: el nombre es único sin distinguir mayúsculas, contando
 *   también las mesas inactivas (un índice por expresión sobre lower(name)).
 * - tables_current_order_id: índice parcial para el "¿qué mesas cubre el pedido?".
 *
 * Sin ON DELETE ni triggers: las mesas no se borran (se desactivan) y los pedidos
 * quedan como historial; el servicio mantiene el invariante "mesa cubierta ⇒
 * pedido abierto".
 */
export async function up({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.transaction(async (transaction) => {
    await context.sequelize.query(
      `
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        status VARCHAR(16) NOT NULL DEFAULT 'open'
          CONSTRAINT orders_status_allowed CHECK (
            status IN ('open', 'closed', 'cancelled', 'merged')
          ),
        opened_by_user_id INTEGER NOT NULL REFERENCES users(id),
        opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        ready_at TIMESTAMPTZ,
        ready_by_user_id INTEGER REFERENCES users(id),
        bill_requested_at TIMESTAMPTZ,
        bill_requested_by_user_id INTEGER REFERENCES users(id),
        closed_at TIMESTAMPTZ,
        closed_by_user_id INTEGER REFERENCES users(id),
        cancel_reason VARCHAR(200),
        merged_into_order_id INTEGER REFERENCES orders(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT orders_closed_consistent CHECK (
          (status = 'open' AND closed_at IS NULL AND closed_by_user_id IS NULL)
          OR (status <> 'open' AND closed_at IS NOT NULL AND closed_by_user_id IS NOT NULL)
        ),
        CONSTRAINT orders_cancel_reason CHECK (
          (status = 'cancelled') = (cancel_reason IS NOT NULL)
        ),
        CONSTRAINT orders_merged_consistent CHECK (
          (status = 'merged') = (merged_into_order_id IS NOT NULL)
        ),
        CONSTRAINT orders_no_self_merge CHECK (
          merged_into_order_id IS NULL OR merged_into_order_id <> id
        ),
        CONSTRAINT orders_ready_pair CHECK (
          (ready_at IS NULL) = (ready_by_user_id IS NULL)
        ),
        CONSTRAINT orders_bill_pair CHECK (
          (bill_requested_at IS NULL) = (bill_requested_by_user_id IS NULL)
        )
      )
    `,
      { transaction },
    );
    await context.sequelize.query(
      'CREATE INDEX orders_opened_by_user_id ON orders (opened_by_user_id)',
      { transaction },
    );
    await context.sequelize.query(
      `
      CREATE TABLE tables (
        id SERIAL PRIMARY KEY,
        name VARCHAR(40) NOT NULL
          CONSTRAINT tables_name_valid CHECK (name <> '' AND name = btrim(name)),
        is_active BOOLEAN NOT NULL DEFAULT true,
        current_order_id INTEGER REFERENCES orders(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,
      { transaction },
    );
    await context.sequelize.query(
      'CREATE UNIQUE INDEX tables_name_unique ON tables (lower(name))',
      { transaction },
    );
    await context.sequelize.query(
      'CREATE INDEX tables_current_order_id ON tables (current_order_id) ' +
        'WHERE current_order_id IS NOT NULL',
      { transaction },
    );
  });
}

export async function down({ context }: { context: QueryInterface }): Promise<void> {
  // Revertir pierde las mesas y el historial de pedidos; el orden importa por la FK
  // tables.current_order_id: primero tables, después orders. Solo para desarrollo.
  await context.sequelize.transaction(async (transaction) => {
    await context.dropTable('tables', { transaction });
    await context.dropTable('orders', { transaction });
  });
}
