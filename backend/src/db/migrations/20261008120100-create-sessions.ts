import type { QueryInterface } from 'sequelize';

export async function up({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.transaction(async (transaction) => {
    await context.sequelize.query(
      `
      CREATE TABLE sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(64) NOT NULL CONSTRAINT sessions_token_hash_unique UNIQUE
          CONSTRAINT sessions_token_hash_valid CHECK (token_hash ~ '^[0-9a-f]{64}$'),
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,
      { transaction },
    );
    await context.addIndex('sessions', ['user_id'], { name: 'sessions_user_id_idx', transaction });
  });
}

export async function down({ context }: { context: QueryInterface }): Promise<void> {
  await context.dropTable('sessions');
}
