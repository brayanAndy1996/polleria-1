import type { QueryInterface } from 'sequelize';

export async function up({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.transaction(async (transaction) => {
    await context.sequelize.query(
      `
      ALTER TABLE products ADD CONSTRAINT products_id_category_inventory_unique UNIQUE (id, category);
      CREATE TABLE inventory_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        chicken_enabled BOOLEAN NOT NULL DEFAULT false,
        breast_eighths INTEGER NOT NULL DEFAULT 0 CHECK (breast_eighths >= 0),
        leg_eighths INTEGER NOT NULL DEFAULT 0 CHECK (leg_eighths >= 0)
      );
      INSERT INTO inventory_state (id) VALUES (1);
      CREATE TABLE inventory_drinks (
        product_id INTEGER PRIMARY KEY,
        product_category VARCHAR(16) NOT NULL DEFAULT 'drink' CHECK (product_category = 'drink'),
        enabled BOOLEAN NOT NULL DEFAULT false,
        quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
        CONSTRAINT inventory_drinks_product_category_fkey FOREIGN KEY (product_id, product_category)
          REFERENCES products(id, category) ON UPDATE RESTRICT ON DELETE RESTRICT
      );
      CREATE TABLE inventory_movements (
        id SERIAL PRIMARY KEY,
        kind VARCHAR(8) NOT NULL CHECK (kind IN ('breast','leg','drink')),
        product_id INTEGER REFERENCES products(id),
        product_name VARCHAR(60),
        type VARCHAR(16) NOT NULL CHECK (type IN ('batch','receipt','adjustment','consumption','control')),
        delta INTEGER NOT NULL CHECK (delta >= -2147483647),
        quantity_after INTEGER NOT NULL CHECK (quantity_after >= 0),
        enabled_after BOOLEAN,
        reason VARCHAR(200) NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 200),
        actor_user_id INTEGER NOT NULL REFERENCES users(id),
        actor_display_name VARCHAR(40) NOT NULL,
        ticket_id INTEGER REFERENCES kitchen_tickets(id),
        created_at TIMESTAMPTZ NOT NULL,
        CHECK ((kind = 'drink' AND product_id IS NOT NULL AND product_name IS NOT NULL AND length(product_name) > 0)
          OR (kind IN ('breast','leg') AND product_id IS NULL AND product_name IS NULL)),
        CHECK ((type = 'control' AND delta = 0 AND enabled_after IS NOT NULL AND ticket_id IS NULL)
          OR (type <> 'control' AND delta <> 0 AND enabled_after IS NULL
            AND ((type = 'consumption' AND delta < 0 AND ticket_id IS NOT NULL)
              OR (ticket_id IS NULL AND ((type = 'batch' AND kind IN ('breast','leg') AND delta > 0)
                OR (type = 'receipt' AND kind = 'drink' AND delta > 0) OR type = 'adjustment')))))
      );
      CREATE INDEX inventory_movements_ticket_id ON inventory_movements(ticket_id);
      CREATE UNIQUE INDEX inventory_movements_consumption_unique
        ON inventory_movements(ticket_id, kind, coalesce(product_id, 0)) WHERE type = 'consumption';
      CREATE TABLE inventory_commands (
        key VARCHAR(128) PRIMARY KEY,
        request_hash CHAR(64) NOT NULL,
        response_status INTEGER NOT NULL CHECK (response_status IN (0,200,201)),
        response_body JSONB NOT NULL CHECK (jsonb_typeof(response_body) = 'object'),
        actor_user_id INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL
      );`,
      { transaction },
    );
  });
}

export async function down({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.transaction(async (transaction) => {
    await context.sequelize.query(
      `
      DROP TABLE inventory_commands, inventory_movements, inventory_drinks, inventory_state;
      ALTER TABLE products DROP CONSTRAINT products_id_category_inventory_unique;
    `,
      { transaction },
    );
  });
}
