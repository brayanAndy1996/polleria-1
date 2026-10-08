import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrateDown, migrateUp } from '../src/db/migrator.ts';
import {
  assertConnectedToTestDatabase,
  closeTestDatabase,
  connectTestDatabase,
  migrateAndClearAuthTables,
  resetMigrationTables,
  tableExists,
} from './helpers/test-database.ts';

const MIGRATIONS = ['20261008120000-create-users.ts', '20261008120100-create-sessions.ts'];

describe('003: migraciones de usuarios y sesiones', () => {
  let sequelize: Sequelize;
  beforeAll(async () => {
    sequelize = await connectTestDatabase();
  });
  beforeEach(async () => {
    await migrateAndClearAuthTables(sequelize);
  });
  afterAll(async () => {
    await closeTestDatabase(sequelize);
  });
  const rows = <T extends object>(sql: string) =>
    sequelize.query<T>(sql, { type: QueryTypes.SELECT });
  const primaryKeyColumns = (table: string) =>
    sequelize.query<{ column_name: string }>(
      `SELECT kcu.column_name FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.constraint_schema = kcu.constraint_schema
       WHERE tc.table_schema = current_schema() AND tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
       ORDER BY kcu.ordinal_position`,
      { bind: [table], type: QueryTypes.SELECT },
    );
  const insertUser = (
    username: string | null,
    displayName: string | null = 'Juan',
    hash: string | null = 'x'.repeat(60),
    roles: string | null = '{waiter}',
  ) =>
    sequelize.query(
      'INSERT INTO users (username, display_name, pin_hash, roles) VALUES ($1, $2, $3, $4::varchar(16)[]) RETURNING id',
      { bind: [username, displayName, hash, roles] },
    );

  it('AC-05: users tiene tipos, valores predeterminados y restricciones en PostgreSQL', async () => {
    const columns = await rows<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      udt_name: string;
      character_maximum_length: number | null;
      column_default: string | null;
      is_identity: string;
    }>(
      "SELECT column_name, data_type, is_nullable, udt_name, character_maximum_length, column_default, is_identity FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' ORDER BY ordinal_position",
    );
    expect(columns.map((column) => column.column_name)).toEqual([
      'id',
      'username',
      'display_name',
      'pin_hash',
      'roles',
      'is_active',
      'created_at',
      'updated_at',
    ]);
    expect(columns.every((column) => column.is_nullable === 'NO')).toBe(true);
    expect(columns.find((column) => column.column_name === 'roles')).toMatchObject({
      data_type: 'ARRAY',
      udt_name: '_varchar',
    });
    expect(columns.find((column) => column.column_name === 'id')).toMatchObject({
      data_type: 'integer',
    });
    expect(
      columns
        .filter((column) => column.column_name.endsWith('_at'))
        .every((column) => column.data_type === 'timestamp with time zone'),
    ).toBe(true);
    expect(
      await rows(
        "SELECT format_type(atttypid, atttypmod) AS type FROM pg_attribute WHERE attrelid = 'users'::regclass AND attname = 'roles'",
      ),
    ).toEqual([{ type: 'character varying(16)[]' }]);
    expect(
      columns.map(({ column_name, data_type, character_maximum_length }) => ({
        column_name,
        data_type,
        character_maximum_length,
      })),
    ).toEqual([
      { column_name: 'id', data_type: 'integer', character_maximum_length: null },
      { column_name: 'username', data_type: 'character varying', character_maximum_length: 32 },
      { column_name: 'display_name', data_type: 'character varying', character_maximum_length: 40 },
      { column_name: 'pin_hash', data_type: 'character varying', character_maximum_length: 60 },
      { column_name: 'roles', data_type: 'ARRAY', character_maximum_length: null },
      { column_name: 'is_active', data_type: 'boolean', character_maximum_length: null },
      {
        column_name: 'created_at',
        data_type: 'timestamp with time zone',
        character_maximum_length: null,
      },
      {
        column_name: 'updated_at',
        data_type: 'timestamp with time zone',
        character_maximum_length: null,
      },
    ]);
    expect(await primaryKeyColumns('users')).toEqual([{ column_name: 'id' }]);
    const idColumn = columns.find((column) => column.column_name === 'id')!;
    expect(idColumn.is_identity === 'YES' || /^nextval\(/.test(idColumn.column_default ?? '')).toBe(
      true,
    );
    await insertUser('mozo.juan');
    await insertUser('mozo.caja', 'Rosa', 'x'.repeat(60), '{cashier,waiter}');
    await insertUser('todos', 'Todos', 'x'.repeat(60), '{waiter,kitchen,cashier,admin}');
    expect(await rows('SELECT id FROM users ORDER BY id')).toEqual([
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ]);
    expect(
      await rows(
        'SELECT is_active, created_at IS NOT NULL AS created, updated_at IS NOT NULL AS updated FROM users',
      ),
    ).toEqual(Array.from({ length: 3 }, () => ({ is_active: true, created: true, updated: true })));
    for (const args of [
      ['mozo.juan'],
      ['Mozo.juan'],
      ['ab'],
      ['juan perez'],
      ...[
        '{}',
        '{chef}',
        '{Waiter}',
        '{waiter,waiter}',
        '{waiter,NULL}',
        '{{waiter},{cashier}}',
      ].map((roles) => ['nuevo', 'Juan', 'x'.repeat(60), roles]),
      ['nuevo', ''],
      ['nuevo', ' Juan'],
      ['nuevo', 'Juan', 'x'.repeat(59)],
      ['nuevo', 'Juan', 'x'.repeat(61)],
      [null],
      ['nuevo', null],
      ['nuevo', 'Juan', null],
      ['nuevo', 'Juan', 'x'.repeat(60), null],
    ] as [string | null, (string | null)?, (string | null)?, (string | null)?][])
      await expect(insertUser(...args)).rejects.toBeInstanceOf(Error);
    expect(await rows('SELECT id FROM users')).toHaveLength(3);
  });
  it('AC-06: sessions protege el hash, la relación y elimina sesiones al borrar su usuario', async () => {
    await insertUser('mozo.juan');
    const insertSession = (hash: string, userId = 1) =>
      sequelize.query(
        'INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        { bind: [userId, hash, '2026-10-09T07:00:00.000Z'] },
      );
    const columns = await rows<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      character_maximum_length: number | null;
      column_default: string | null;
      is_identity: string;
    }>(
      "SELECT column_name, data_type, is_nullable, character_maximum_length, column_default, is_identity FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'sessions' ORDER BY ordinal_position",
    );
    expect(columns.map((column) => column.column_name)).toEqual([
      'id',
      'user_id',
      'token_hash',
      'expires_at',
      'created_at',
    ]);
    expect(columns.every((column) => column.is_nullable === 'NO')).toBe(true);
    expect(
      columns.map(({ column_name, data_type, character_maximum_length }) => ({
        column_name,
        data_type,
        character_maximum_length,
      })),
    ).toEqual([
      { column_name: 'id', data_type: 'integer', character_maximum_length: null },
      { column_name: 'user_id', data_type: 'integer', character_maximum_length: null },
      { column_name: 'token_hash', data_type: 'character varying', character_maximum_length: 64 },
      {
        column_name: 'expires_at',
        data_type: 'timestamp with time zone',
        character_maximum_length: null,
      },
      {
        column_name: 'created_at',
        data_type: 'timestamp with time zone',
        character_maximum_length: null,
      },
    ]);
    expect(await primaryKeyColumns('sessions')).toEqual([{ column_name: 'id' }]);
    const idColumn = columns.find((column) => column.column_name === 'id')!;
    expect(idColumn.is_identity === 'YES' || /^nextval\(/.test(idColumn.column_default ?? '')).toBe(
      true,
    );
    expect(columns.find((column) => column.column_name === 'created_at')?.column_default).toMatch(
      /now\(\)|CURRENT_TIMESTAMP/i,
    );
    await insertSession('a'.repeat(64));
    for (const token of ['a'.repeat(64), 'A'.repeat(64), 'a'.repeat(63), 'g'.repeat(64)])
      await expect(insertSession(token)).rejects.toBeInstanceOf(Error);
    await expect(insertSession('b'.repeat(64), 99)).rejects.toBeInstanceOf(Error);
    const indexes = await rows<{ indexname: string; indexdef: string }>(
      "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'sessions' AND schemaname = current_schema()",
    );
    expect(indexes.find((index) => index.indexname === 'sessions_user_id_idx')?.indexdef).toContain(
      '(user_id)',
    );
    expect(
      indexes.find((index) => index.indexname === 'sessions_token_hash_unique')?.indexdef,
    ).toContain('UNIQUE');
    expect(await rows('SELECT created_at IS NOT NULL AS created FROM sessions')).toEqual([
      { created: true },
    ]);
    const firstSession = await rows<{ id: number }>('SELECT id FROM sessions');
    expect(firstSession[0]!.id).toBe(1);
    await insertSession('c'.repeat(64));
    const sessionIds = await rows<{ id: number }>('SELECT id FROM sessions ORDER BY id');
    expect(sessionIds).toHaveLength(2);
    expect(sessionIds[1]!.id).toBeGreaterThan(sessionIds[0]!.id);
    await assertConnectedToTestDatabase(sequelize);
    await sequelize.query('DELETE FROM users WHERE id = $1', { bind: [1] });
    expect(await rows('SELECT * FROM sessions')).toEqual([]);
  });
  it('AC-07: aplica, revierte y reaplica las migraciones en orden', async () => {
    await resetMigrationTables(sequelize);
    expect(await migrateUp(sequelize)).toEqual(MIGRATIONS);
    expect(await tableExists(sequelize, 'users')).toBe(true);
    expect(await tableExists(sequelize, 'sessions')).toBe(true);
    await assertConnectedToTestDatabase(sequelize);
    expect(await migrateDown(sequelize)).toEqual([MIGRATIONS[1]]);
    expect(await tableExists(sequelize, 'sessions')).toBe(false);
    expect(await tableExists(sequelize, 'users')).toBe(true);
    await assertConnectedToTestDatabase(sequelize);
    expect(await migrateDown(sequelize)).toEqual([MIGRATIONS[0]]);
    expect(await tableExists(sequelize, 'users')).toBe(false);
    expect(await migrateUp(sequelize)).toEqual(MIGRATIONS);
    expect(await tableExists(sequelize, 'users')).toBe(true);
    expect(await tableExists(sequelize, 'sessions')).toBe(true);
  });
});
