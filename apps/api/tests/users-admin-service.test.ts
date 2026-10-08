import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import type { UserRole } from '@polleria/shared';
import { defineModels } from '../src/models/index.ts';
import { createBcryptPinHasher } from '../src/services/auth/pin-hasher.ts';
import type { PinHasher } from '../src/services/auth/pin-hasher.ts';
import { createLoginLimiter } from '../src/services/auth/login-limiter.ts';
import type { LoginLimiter } from '../src/services/auth/login-limiter.ts';
import { createSessionService } from '../src/services/auth/session.service.ts';
import type { SessionService } from '../src/services/auth/session.service.ts';
import type { Models } from '../src/models/index.ts';
import { createUserService, createUserAdminService } from '../src/services/users/user.service.ts';
import {
  closeTestDatabase,
  connectTestDatabase,
  migrateAndClearAuthTables,
} from './helpers/test-database.ts';

const T0 = new Date('2026-10-08T15:00:00.000Z');
const USER_NOT_FOUND = {
  code: 'USER_NOT_FOUND',
  httpStatus: 404,
  message: 'Ese usuario no existe.',
};
const LAST_ADMIN_REQUIRED = {
  code: 'LAST_ADMIN_REQUIRED',
  httpStatus: 409,
  message: 'Debe quedar al menos un administrador activo.',
};

describe('004: servicio de administración de usuarios sobre polleria_test', () => {
  let sequelize: Sequelize;
  let models: Models;
  let pinHasher: PinHasher;
  let sessionService: SessionService;
  let loginLimiter: LoginLimiter;
  let service: ReturnType<typeof createUserAdminService>;
  const createUser = (username: string, displayName: string, roles: UserRole[], pin = '2468') =>
    createUserService({ models, pinHasher }).createUser({ username, displayName, roles, pin });
  const rows = <T extends object>(sql: string, bind?: (string | number)[]) =>
    sequelize.query<T>(sql, { type: QueryTypes.SELECT, bind });
  const sessionsOf = (userId: number) =>
    rows<{ user_id: number }>('SELECT user_id FROM sessions WHERE user_id = $1', [userId]);
  const userRow = (id: number) =>
    rows<{
      username: string;
      display_name: string;
      pin_hash: string;
      roles: string[];
      is_active: boolean;
    }>('SELECT username, display_name, pin_hash, roles, is_active FROM users WHERE id = $1', [id]);

  beforeAll(async () => {
    sequelize = await connectTestDatabase();
  });
  beforeEach(async () => {
    await migrateAndClearAuthTables(sequelize);
    const now = () => new Date(T0.getTime());
    models = defineModels(sequelize);
    pinHasher = createBcryptPinHasher({ cost: 4 });
    sessionService = createSessionService({ models, now });
    loginLimiter = createLoginLimiter({ now });
    service = createUserAdminService({ models, pinHasher, sessionService, loginLimiter });
  });
  afterAll(async () => {
    await closeTestDatabase(sequelize);
  });

  it('AC-08: lista todos los usuarios en orden español con llaves exactas y sin PIN', async () => {
    expect(await service.listUsers()).toEqual([]);
    const zoila = await createUser('zoila', 'Zoila', ['waiter']);
    const ana = await createUser('ana', 'ana', ['waiter', 'cashier']);
    // La base puede guardar los roles en otro orden: la lista siempre los ordena.
    await sequelize.query("UPDATE users SET roles = '{cashier,waiter}' WHERE username = 'ana'");
    const dueno = await createUser('dueno', 'Don Carlos', ['admin']);
    const inactivo = await createUser('inactivo', 'Inactivo', ['waiter']);
    await sequelize.query("UPDATE users SET is_active = false WHERE username = 'inactivo'");
    const users = await service.listUsers();
    expect(users).toEqual([
      {
        id: ana.id,
        username: 'ana',
        displayName: 'ana',
        roles: ['waiter', 'cashier'],
        isActive: true,
      },
      {
        id: dueno.id,
        username: 'dueno',
        displayName: 'Don Carlos',
        roles: ['admin'],
        isActive: true,
      },
      {
        id: inactivo.id,
        username: 'inactivo',
        displayName: 'Inactivo',
        roles: ['waiter'],
        isActive: false,
      },
      { id: zoila.id, username: 'zoila', displayName: 'Zoila', roles: ['waiter'], isActive: true },
    ]);
    for (const user of users) {
      expect(Object.keys(user).sort()).toEqual([
        'displayName',
        'id',
        'isActive',
        'roles',
        'username',
      ]);
      expect(JSON.stringify(user)).not.toContain('pinHash');
      expect(JSON.stringify(user)).not.toContain('pin_hash');
    }
  });

  it('AC-09: edita nombre y roles sin tocar usuario, PIN, sesiones ni conteo', async () => {
    const juan = await createUser('mozo.juan', 'Juan', ['waiter'], '2468');
    await sessionService.createSession(juan.id);
    // Cuatro fallos antes de editar: si el conteo se limpiara, el quinto después no bloquearía.
    for (let count = 0; count < 4; count++) loginLimiter.registerAttempt(juan.id);
    const before = await userRow(juan.id);
    const updated = await service.updateUser(juan.id, {
      displayName: '  Juan P\u00E9rez ',
      roles: ['cashier', 'waiter'],
    });
    expect(updated).toEqual({
      id: juan.id,
      username: 'mozo.juan',
      displayName: 'Juan P\u00E9rez',
      roles: ['waiter', 'cashier'],
      isActive: true,
    });
    const saved = await userRow(juan.id);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      username: 'mozo.juan',
      display_name: 'Juan P\u00E9rez',
      roles: ['waiter', 'cashier'],
      is_active: true,
      pin_hash: before[0]!.pin_hash,
    });
    expect(await sessionsOf(juan.id)).toHaveLength(1);
    loginLimiter.registerAttempt(juan.id);
    expect(loginLimiter.getRetryAfterSeconds(juan.id)).toBe(900);
  });
  it('AC-09: rechaza entradas inválidas con ZodError sin cambiar la fila', async () => {
    const juan = await createUser('mozo.juan', 'Juan', ['waiter'], '2468');
    const before = await userRow(juan.id);
    const empty = await service.updateUser(juan.id, {}).catch((error: unknown) => error);
    expect(empty).toBeInstanceOf(ZodError);
    expect((empty as ZodError).issues.map((issue) => issue.message)).toContain(
      'No indicaste ning\u00FAn cambio.',
    );
    for (const input of [
      { roles: [] },
      { roles: ['chef'] },
      { displayName: '' },
      { isActive: 'si' },
      { pin: '3968' },
      { username: 'otro' },
    ])
      await expect(service.updateUser(juan.id, input)).rejects.toBeInstanceOf(ZodError);
    expect(await userRow(juan.id)).toEqual(before);
  });
  it('AC-09: un usuario inexistente se rechaza con USER_NOT_FOUND', async () => {
    await expect(service.updateUser(999999, { displayName: 'Nadie' })).rejects.toMatchObject(
      USER_NOT_FOUND,
    );
  });

  it('AC-10: desactivar borra sesiones y limpia el conteo; reactivar no hace más', async () => {
    const juan = await createUser('mozo.juan', 'Juan', ['waiter'], '2468');
    const ana = await createUser('caja.ana', 'Ana', ['cashier'], '1357');
    await sessionService.createSession(juan.id);
    await sessionService.createSession(juan.id);
    await sessionService.createSession(ana.id);
    for (let count = 0; count < 5; count++) loginLimiter.registerAttempt(juan.id);
    expect(loginLimiter.getRetryAfterSeconds(juan.id)).toBe(900);
    const before = await userRow(juan.id);
    const deactivated = await service.updateUser(juan.id, { isActive: false });
    expect(deactivated.isActive).toBe(false);
    expect(await userRow(juan.id)).toEqual([
      expect.objectContaining({ is_active: false, pin_hash: before[0]!.pin_hash }),
    ]);
    expect(await sessionsOf(juan.id)).toEqual([]);
    expect(loginLimiter.getRetryAfterSeconds(juan.id)).toBeNull();
    expect(await sessionsOf(ana.id)).toHaveLength(1);
    // Desactivar a un usuario ya inactivo es idempotente.
    const again = await service.updateUser(juan.id, { isActive: false });
    expect(again.isActive).toBe(false);
    // Se puede editar roles y restablecer el PIN de un usuario inactivo.
    const edited = await service.updateUser(juan.id, { roles: ['cashier'] });
    expect(edited).toMatchObject({ roles: ['cashier'], isActive: false });
    await expect(service.resetUserPin(juan.id, '5846')).resolves.toBeUndefined();
    // Reactivar solo cambia el estado: ni sesiones ni conteo nuevos.
    const reactivated = await service.updateUser(juan.id, { isActive: true });
    expect(reactivated.isActive).toBe(true);
    expect(await userRow(juan.id)).toEqual([expect.objectContaining({ is_active: true })]);
    expect(await sessionsOf(juan.id)).toEqual([]);
    expect(loginLimiter.getRetryAfterSeconds(juan.id)).toBeNull();
  });

  it('AC-11: nada puede dejar el sistema sin administradores activos', async () => {
    const dueno = await createUser('dueno', 'Don Carlos', ['admin']);
    await createUser('mozo.juan', 'Juan', ['waiter']);
    const before = await userRow(dueno.id);
    for (const input of [
      { isActive: false },
      { roles: ['waiter'] },
      { isActive: false, roles: ['waiter'] },
    ]) {
      await expect(service.updateUser(dueno.id, input)).rejects.toMatchObject(LAST_ADMIN_REQUIRED);
      expect(await userRow(dueno.id)).toEqual(before);
    }
  });
  it('AC-11: con otro administrador activo el propio puede desactivarse o ceder el rol', async () => {
    const dueno = await createUser('dueno', 'Don Carlos', ['admin']);
    await createUser('admin2', 'Segunda', ['admin']);
    const deactivated = await service.updateUser(dueno.id, { isActive: false });
    expect(deactivated.isActive).toBe(false);
    const admin3 = await createUser('admin3', 'Tercera', ['admin']);
    const demoted = await service.updateUser(admin3.id, { roles: ['waiter'] });
    expect(demoted.roles).toEqual(['waiter']);
    expect(demoted.isActive).toBe(true);
  });
  it('AC-11: un administrador inactivo no cuenta para la guardia', async () => {
    const dueno = await createUser('dueno', 'Don Carlos', ['admin']);
    await createUser('admin2', 'Segunda', ['admin']);
    await sequelize.query("UPDATE users SET is_active = false WHERE username = 'admin2'");
    await expect(service.updateUser(dueno.id, { isActive: false })).rejects.toMatchObject(
      LAST_ADMIN_REQUIRED,
    );
  });
  it('AC-11: tocar a un inactivo o a un no administrador nunca dispara la guardia', async () => {
    await createUser('dueno', 'Don Carlos', ['admin']);
    const mozo = await createUser('mozo.juan', 'Juan', ['waiter']);
    const viejo = await createUser('admin.viejo', 'Viejo', ['admin']);
    await sequelize.query("UPDATE users SET is_active = false WHERE username = 'admin.viejo'");
    // Quitar el rol admin de un usuario inactivo no cambia la cuenta de activos: se resuelve.
    const demoted = await service.updateUser(viejo.id, { roles: ['waiter'] });
    expect(demoted.roles).toEqual(['waiter']);
    // Desactivar al mozo tampoco: nunca fue administrador.
    const deactivated = await service.updateUser(mozo.id, { isActive: false });
    expect(deactivated.isActive).toBe(false);
  });
  it('AC-11: dos retiros simultáneos del rol admin dejan exactamente un administrador', async () => {
    const dueno = await createUser('dueno', 'Don Carlos', ['admin']);
    const admin2 = await createUser('admin2', 'Segunda', ['admin']);
    const results = await Promise.allSettled([
      service.updateUser(dueno.id, { roles: ['waiter'] }),
      service.updateUser(admin2.id, { roles: ['waiter'] }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({ reason: LAST_ADMIN_REQUIRED });
    const activeAdmins = await rows<{ id: number }>(
      "SELECT id FROM users WHERE is_active AND roles @> '{admin}'",
    );
    expect(activeAdmins).toHaveLength(1);
  });

  it('AC-12: restablece el PIN, borra las sesiones y limpia el conteo', async () => {
    const juan = await createUser('mozo.juan', 'Juan', ['waiter'], '2468');
    await sessionService.createSession(juan.id);
    for (let count = 0; count < 5; count++) loginLimiter.registerAttempt(juan.id);
    expect(loginLimiter.getRetryAfterSeconds(juan.id)).toBe(900);
    const before = await userRow(juan.id);
    await expect(service.resetUserPin(juan.id, '5846')).resolves.toBeUndefined();
    const saved = await userRow(juan.id);
    expect(saved[0]!.pin_hash).not.toBe(before[0]!.pin_hash);
    expect(await pinHasher.verify('5846', saved[0]!.pin_hash)).toBe(true);
    expect(await pinHasher.verify('2468', saved[0]!.pin_hash)).toBe(false);
    expect(await sessionsOf(juan.id)).toEqual([]);
    expect(loginLimiter.getRetryAfterSeconds(juan.id)).toBeNull();
  });
  it('AC-12: rechaza PIN débiles o mal formados sin tocar hash ni sesiones', async () => {
    const juan = await createUser('mozo.juan', 'Juan', ['waiter'], '2468');
    await sessionService.createSession(juan.id);
    const before = await userRow(juan.id);
    for (const pin of ['1234', '123'])
      await expect(service.resetUserPin(juan.id, pin)).rejects.toBeInstanceOf(ZodError);
    expect((await userRow(juan.id))[0]!.pin_hash).toBe(before[0]!.pin_hash);
    expect(await sessionsOf(juan.id)).toHaveLength(1);
  });
  it('AC-12: un usuario inexistente da 404 y los demás no se tocan', async () => {
    const juan = await createUser('mozo.juan', 'Juan', ['waiter'], '2468');
    const ana = await createUser('caja.ana', 'Ana', ['cashier'], '1357');
    await sessionService.createSession(ana.id);
    const anaBefore = await userRow(ana.id);
    await expect(service.resetUserPin(999999, '5846')).rejects.toMatchObject(USER_NOT_FOUND);
    // El PIN de un usuario inactivo también se puede restablecer.
    await sequelize.query('UPDATE users SET is_active = false WHERE id = $1', { bind: [juan.id] });
    await expect(service.resetUserPin(juan.id, '5846')).resolves.toBeUndefined();
    expect(await pinHasher.verify('5846', (await userRow(juan.id))[0]!.pin_hash)).toBe(true);
    expect(await userRow(ana.id)).toEqual(anaBefore);
    expect(await sessionsOf(ana.id)).toHaveLength(1);
  });
});
