// Fixture de AC-22. Solo sintaxis borrable de TypeScript: umzug la carga con el type stripping de
// Node. No importa valores de sequelize; usa SQL directo con el QueryInterface que recibe.
import type { QueryInterface } from 'sequelize';

export async function up({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.query('CREATE TABLE fixture_b (id INTEGER PRIMARY KEY)');
}

export async function down({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.query('DROP TABLE fixture_b');
}
