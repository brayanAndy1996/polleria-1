import type { QueryInterface } from 'sequelize';

/** Solo pagos nuevos: no se infiere ningún cobro de pedidos históricos cerrados. */
export async function up({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.transaction(async (transaction) => {
    await context.sequelize.query(
      `CREATE TABLE payments (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id),
        method VARCHAR(8) NOT NULL CHECK (method IN ('cash', 'yape', 'plin', 'card')),
        amount_cents INTEGER NOT NULL CHECK (amount_cents BETWEEN 1 AND 2147483647),
        received_cents INTEGER NOT NULL CHECK (received_cents BETWEEN amount_cents AND 2147483647),
        change_cents INTEGER NOT NULL CHECK (change_cents >= 0 AND change_cents = received_cents - amount_cents),
        cashier_user_id INTEGER NOT NULL REFERENCES users(id),
        paid_at TIMESTAMPTZ NOT NULL,
        bill_token CHAR(64) NOT NULL CHECK (bill_token ~ '^[0-9a-f]{64}$'),
        snapshot_version SMALLINT NOT NULL CHECK (snapshot_version = 1),
        snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
        CHECK (method = 'cash' OR (received_cents = amount_cents AND change_cents = 0))
      );
      CREATE INDEX payments_paid_at_id ON payments (paid_at, id);`,
      { transaction },
    );
  });
}

export async function down({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.transaction(async (transaction) => {
    await context.sequelize.query('DROP TABLE payments', { transaction });
  });
}
