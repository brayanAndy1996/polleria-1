// Fixture de AC-23. Solo sintaxis borrable de TypeScript: umzug la carga con el type stripping de
// Node. Crea su propia tabla para no depender de ninguna migración.
import type { QueryInterface } from 'sequelize';

export async function up({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.query(
    'CREATE TABLE IF NOT EXISTS fixture_seed_rows (id SERIAL PRIMARY KEY, label VARCHAR(50) NOT NULL)',
  );
  await context.sequelize.query(
    "INSERT INTO fixture_seed_rows (label) VALUES ('semilla de prueba')",
  );
}

export async function down({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.query('DROP TABLE IF EXISTS fixture_seed_rows');
}
