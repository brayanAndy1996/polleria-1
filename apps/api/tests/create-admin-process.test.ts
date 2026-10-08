import path from 'node:path';
import request from 'supertest';
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { createBcryptPinHasher } from '../src/services/auth/pin-hasher.ts';
import { ManagedProcess, buildChildEnv, killAllChildProcesses } from './helpers/child-process.ts';
import {
  closeTestDatabase,
  connectTestDatabase,
  getTestDatabaseUrl,
  migrateAndClearAuthTables,
  resetMigrationTables,
} from './helpers/test-database.ts';
import { setupAuth } from './helpers/auth.ts';
import {
  UNREACHABLE_DATABASE_URL,
  UNREACHABLE_DATABASE_SECRET,
} from './helpers/unreachable-database.ts';

const ENTRY = path.resolve(import.meta.dirname, '../src/create-admin.ts');

describe('003: comando para crear el administrador', () => {
  let sequelize: Sequelize;
  beforeAll(async () => {
    sequelize = await connectTestDatabase();
  });
  beforeEach(async () => {
    await migrateAndClearAuthTables(sequelize);
  });
  afterEach(async () => {
    await killAllChildProcesses();
  });
  afterAll(async () => {
    await closeTestDatabase(sequelize);
  });
  async function run(input: string, overrides: Record<string, string | undefined> = {}) {
    const process = new ManagedProcess(
      ENTRY,
      [],
      buildChildEnv({ NODE_ENV: 'test', DATABASE_URL: getTestDatabaseUrl(), ...overrides }),
      input,
    );
    const result = await process.waitForExit(15000);
    await process.kill();
    return result;
  }
  it('AC-26: acepta CRLF, crea solo un administrador, oculta el PIN y permite iniciar sesión', async () => {
    const result = await run('Dueno\r\nDon Carlos\r\n975310\r\n975310\r\n');
    expect(result.code).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.stdout).toContain('Administrador creado: dueno (Don Carlos).');
    expect(result.stderr).toContain(
      'Aviso: esta terminal no puede ocultar el PIN. Para que no se vea al escribirlo, usa PowerShell o el Símbolo del sistema.',
    );
    expect(`${result.stdout}${result.stderr}`).not.toContain('975310');
    const users = await sequelize.query<{
      username: string;
      display_name: string;
      roles: string[];
      is_active: boolean;
      pin_hash: string;
    }>('SELECT * FROM users', { type: QueryTypes.SELECT });
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      username: 'dueno',
      display_name: 'Don Carlos',
      roles: ['admin'],
      is_active: true,
    });
    expect(users[0]!.pin_hash).toMatch(/^\$2b\$10\$/);
    expect(await createBcryptPinHasher().verify('975310', users[0]!.pin_hash)).toBe(true);
    expect(
      (
        await request(createApp({ sequelize }))
          .post('/api/auth/login')
          .send({ username: 'dueno', pin: '975310' })
      ).body,
    ).toMatchObject({ user: { roles: ['admin'] } });
    // La 004 exige PIN fuerte en create-admin: se usa '3968' en lugar de un PIN fácil.
    expect((await run('dueno2\nOtra Persona\n3968\n3968\n')).code).toBe(0);
    expect(await sequelize.query('SELECT id FROM users', { type: QueryTypes.SELECT })).toHaveLength(
      2,
    );
    expect(
      await sequelize.query('SELECT username, roles FROM users ORDER BY id', {
        type: QueryTypes.SELECT,
      }),
    ).toEqual([
      { username: 'dueno', roles: ['admin'] },
      { username: 'dueno2', roles: ['admin'] },
    ]);
  });
  it.each([
    ['PIN distinto', 'nuevo\nNuevo\n975310\n975311\n', 'Los PIN no coinciden.'],
    ['PIN inválido', 'nuevo\nNuevo\n97a5\n', 'El PIN debe tener de 4 a 6 dígitos.'],
    [
      'usuario inválido',
      'ab\n',
      'Usa de 3 a 32 caracteres: letras minúsculas sin tilde, números, punto, guion o guion bajo; empieza y termina con letra o número.',
    ],
    [
      'nombre inválido',
      'nuevo\n\n',
      'Usa de 1 a 40 caracteres: letras, números, espacios, punto, apóstrofo o guion; empieza con letra o número.',
    ],
    ['usuario existente', 'Dueno\nOtro\n1234\n1234\n', 'Ese nombre de usuario ya existe.'],
    ['entrada incompleta', 'nuevo\nNuevo\n', 'Se canceló la creación del administrador.'],
  ])(
    'AC-27: %s termina sin crear usuarios, filtrar el PIN ni mostrar trazas',
    async (_case, input, message) => {
      await setupAuth(sequelize).createUser('dueno', 'Dueño', ['admin'], '135790');
      const result = await run(input);
      expect(result.code).toBe(1);
      expect(result.timedOut).toBe(false);
      expect(result.stderr).toContain(message);
      expect(result.stderr).not.toMatch(/^\s+at /m);
      for (const pin of ['975310', '975311', '97a5', '1234', '135790'])
        expect(`${result.stdout}${result.stderr}`).not.toContain(pin);
      expect(
        await sequelize.query('SELECT id FROM users', { type: QueryTypes.SELECT }),
      ).toHaveLength(1);
    },
  );
  it('AC-27: falla limpiamente sin tablas, sin conexión o sin configuración', async () => {
    const input = 'nuevo\nNuevo\n975310\n975310\n';
    await resetMigrationTables(sequelize);
    for (const [overrides, message] of [
      [{}, 'Faltan las tablas de usuarios. Ejecuta primero pnpm db:migrate.'],
      [{ DATABASE_URL: UNREACHABLE_DATABASE_URL }, 'No se pudo conectar con la base de datos.'],
      [{ DATABASE_URL: undefined }, 'Configuración inválida.'],
    ] as [Record<string, string | undefined>, string][]) {
      const result = await run(input, overrides);
      expect(result.code).toBe(1);
      expect(result.timedOut).toBe(false);
      expect(result.stderr).toContain(message);
      expect(result.stderr).not.toMatch(/^\s+at /m);
      expect(`${result.stdout}${result.stderr}`).not.toContain('975310');
      expect(`${result.stdout}${result.stderr}`).not.toContain(UNREACHABLE_DATABASE_SECRET);
    }
  });
});
