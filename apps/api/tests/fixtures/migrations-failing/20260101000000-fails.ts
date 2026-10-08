// Fixture de AC-44. Solo sintaxis borrable de TypeScript: umzug la carga con el type stripping de
// Node. Está en una carpeta aparte (migrations-failing) para que los glob de las otras pruebas de
// migraciones (fixtures/migrations) nunca la recojan.

export async function up(): Promise<void> {
  await Promise.resolve();
  throw new Error('Falla de prueba.');
}

export async function down(): Promise<void> {
  await Promise.resolve();
}
