import type { QueryInterface } from 'sequelize';

export async function up({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.query(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(32) NOT NULL CONSTRAINT users_username_unique UNIQUE
        CONSTRAINT users_username_valid CHECK (username ~ '^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$'),
      display_name VARCHAR(40) NOT NULL
        CONSTRAINT users_display_name_valid CHECK (display_name <> '' AND display_name = btrim(display_name)),
      pin_hash VARCHAR(60) NOT NULL CONSTRAINT users_pin_hash_length CHECK (char_length(pin_hash) = 60),
      roles VARCHAR(16)[] NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT users_roles_not_empty CHECK (cardinality(roles) >= 1 AND array_ndims(roles) = 1),
      CONSTRAINT users_roles_allowed CHECK (roles <@ ARRAY['waiter', 'kitchen', 'cashier', 'admin']::varchar(16)[]),
      CONSTRAINT users_roles_no_duplicates CHECK (
        cardinality(array_positions(roles, 'waiter')) <= 1 AND
        cardinality(array_positions(roles, 'kitchen')) <= 1 AND
        cardinality(array_positions(roles, 'cashier')) <= 1 AND
        cardinality(array_positions(roles, 'admin')) <= 1
      )
    )
  `);
}

export async function down({ context }: { context: QueryInterface }): Promise<void> {
  await context.dropTable('users');
}
