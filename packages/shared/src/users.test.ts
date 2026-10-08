import { describe, expect, it } from 'vitest';
import {
  ERROR_CODES,
  adminUserSchema,
  createUserRequestSchema,
  errorResponseSchema,
  isWeakPin,
  pinSchema,
  resetPinRequestSchema,
  strongPinSchema,
  updateUserRequestSchema,
  usersResponseSchema,
  WEAK_PIN_MESSAGE,
} from './index.ts';

const PIN_MESSAGE = 'El PIN debe tener de 4 a 6 d\u00EDgitos.';
const NO_CHANGES_MESSAGE = 'No indicaste ning\u00FAn cambio.';
const USER_NOT_FOUND_BODY = {
  error: { code: 'USER_NOT_FOUND', message: 'Ese usuario no existe.', details: null },
};
const LAST_ADMIN_BODY = {
  error: {
    code: 'LAST_ADMIN_REQUIRED',
    message: 'Debe quedar al menos un administrador activo.',
    details: null,
  },
};
const ADMIN_USER = {
  id: 3,
  username: 'mozo.juan',
  displayName: 'Juan',
  roles: ['waiter'],
  isActive: true,
};

describe('004: esquemas de gestión de usuarios', () => {
  it('AC-01: exporta el mensaje único del PIN fácil', () => {
    expect(WEAK_PIN_MESSAGE).toBe('Ese PIN es muy f\u00E1cil de adivinar. Elige otro.');
  });
  it.each([
    // Repetidos
    '0000',
    '1111',
    '9999',
    '55555',
    '222222',
    // Secuencias circulares ascendentes, incluidas las que cruzan el 9 -> 0
    '0123',
    '1234',
    '2345',
    '3456',
    '4567',
    '5678',
    '6789',
    '7890',
    '8901',
    '9012',
    '01234',
    '12345',
    '23456',
    '012345',
    '123456',
    // Secuencias circulares descendentes
    '4321',
    '3210',
    '9876',
    '0987',
    '2109',
    '10987',
    '54321',
    '654321',
    '98765',
    // Años 1900-2099
    '1900',
    '1968',
    '2000',
    '2026',
    '2099',
    // Fechas DDMM válidas
    '0101',
    '1212',
    '2512',
    '3105',
    '3112',
    // Fechas DDMMAA válidas
    '150385',
    '251299',
    // Lista corta: la columna del medio del teclado numérico
    '2580',
  ])('AC-01: isWeakPin marca el PIN fácil %s', (pin) => {
    expect(isWeakPin(pin)).toBe(true);
  });
  it.each([
    '2468',
    '1357',
    '8642',
    '975310',
    '135790',
    '3968',
    '5926',
    '1029',
    '7770',
    '2946',
    '1899', // año fuera de rango y fecha con mes inválido
    '2100', // año fuera de rango y fecha con mes inválido
    '3212', // día 32 no es fecha
    '320199', // día 32 en DDMMAA
    '1299', // mes 99
    '1122', // mes 22
  ])('AC-01: isWeakPin acepta el PIN fuerte %s', (pin) => {
    expect(isWeakPin(pin)).toBe(false);
  });
  it.each(['123', '12a4', '', '0000000'])(
    'AC-01: isWeakPin devuelve false sin lanzar para la entrada fuera de formato %s',
    (pin) => {
      expect(() => isWeakPin(pin)).not.toThrow();
      expect(isWeakPin(pin)).toBe(false);
    },
  );
  it('AC-01: isWeakPin nunca lanza aunque reciba valores que no son texto', () => {
    for (const value of [undefined, null, 1234, ['1234'], {}]) {
      const probe = isWeakPin as (input: unknown) => boolean;
      expect(() => probe(value)).not.toThrow();
      expect(probe(value)).toBe(false);
    }
  });
  it.each(['2468', '3968'])('AC-01: strongPinSchema acepta el PIN fuerte %s', (pin) => {
    expect(strongPinSchema.parse(pin)).toBe(pin);
  });
  it.each(['1234', '150385'])(
    'AC-01: strongPinSchema rechaza el PIN fácil %s con el mensaje único',
    (pin) => {
      const result = strongPinSchema.safeParse(pin);
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.issues.map((issue) => issue.message)).toContain(WEAK_PIN_MESSAGE);
    },
  );
  it('AC-01: strongPinSchema conserva el mensaje de formato de pinSchema', () => {
    const result = strongPinSchema.safeParse('123');
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.map((issue) => issue.message)).toContain(PIN_MESSAGE);
  });
  it.each(['1234', '0000'])(
    'AC-01: pinSchema sigue aceptando el PIN débil %s para iniciar sesión',
    (pin) => {
      expect(pinSchema.parse(pin)).toBe(pin);
    },
  );

  it('AC-02: createUserRequestSchema normaliza usuario, nombre, PIN y roles', () => {
    expect(
      createUserRequestSchema.parse({
        username: '  MOZO.Nuevo ',
        displayName: '  Ana Mar\u00EDa ',
        pin: '3968',
        roles: ['cashier', 'waiter'],
      }),
    ).toEqual({
      username: 'mozo.nuevo',
      displayName: 'Ana Mar\u00EDa',
      pin: '3968',
      roles: ['waiter', 'cashier'],
    });
  });
  it.each([
    { displayName: 'Ana', pin: '3968', roles: ['waiter'] },
    { username: 'mozo.nuevo', pin: '3968', roles: ['waiter'] },
    { username: 'mozo.nuevo', displayName: 'Ana', roles: ['waiter'] },
    { username: 'mozo.nuevo', displayName: 'Ana', pin: '3968' },
    { username: 'mozo.nuevo', displayName: 'Ana', pin: '3968', roles: ['waiter'], note: 'x' },
    { username: 'ab', displayName: 'Ana', pin: '3968', roles: ['waiter'] },
    { username: 'mozo.nuevo', displayName: '', pin: '3968', roles: ['waiter'] },
    { username: 'mozo.nuevo', displayName: 'Ana', pin: '12', roles: ['waiter'] },
    { username: 'mozo.nuevo', displayName: 'Ana', pin: '3968', roles: [] },
    { username: 'mozo.nuevo', displayName: 'Ana', pin: '3968', roles: ['chef'] },
    { username: 'mozo.nuevo', displayName: 'Ana', pin: '3968', roles: ['waiter', 'waiter'] },
    undefined,
  ])('AC-02: createUserRequestSchema rechaza %s', (input) => {
    expect(createUserRequestSchema.safeParse(input).success).toBe(false);
  });
  it.each(['1234', '2512'])(
    'AC-02: createUserRequestSchema rechaza el PIN fácil %s con el mensaje único',
    (pin) => {
      const result = createUserRequestSchema.safeParse({
        username: 'mozo.nuevo',
        displayName: 'Ana',
        pin,
        roles: ['waiter'],
      });
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.issues.map((issue) => issue.message)).toContain(WEAK_PIN_MESSAGE);
    },
  );

  it('AC-03: updateUserRequestSchema acepta cada campo solo y combinados, con roles ordenados', () => {
    expect(updateUserRequestSchema.parse({ displayName: 'Nuevo' })).toEqual({
      displayName: 'Nuevo',
    });
    expect(updateUserRequestSchema.parse({ roles: ['admin', 'waiter'] })).toEqual({
      roles: ['waiter', 'admin'],
    });
    expect(updateUserRequestSchema.parse({ isActive: false })).toEqual({ isActive: false });
    expect(updateUserRequestSchema.parse({ isActive: true })).toEqual({ isActive: true });
    expect(
      updateUserRequestSchema.parse({ displayName: 'Ana', roles: ['kitchen'], isActive: true }),
    ).toEqual({ displayName: 'Ana', roles: ['kitchen'], isActive: true });
  });
  it('AC-03: updateUserRequestSchema rechaza el objeto vacío con su mensaje', () => {
    const result = updateUserRequestSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.map((issue) => issue.message)).toContain(NO_CHANGES_MESSAGE);
  });
  it.each([
    { pin: '2468' },
    { username: 'otro' },
    { id: 3 },
    { isActive: true, extra: 1 },
    { roles: [] },
    { roles: ['chef'] },
    { displayName: '' },
    { isActive: 'si' },
    undefined,
  ])('AC-03: updateUserRequestSchema rechaza %s', (input) => {
    expect(updateUserRequestSchema.safeParse(input).success).toBe(false);
  });

  it('AC-04: resetPinRequestSchema acepta un PIN fuerte', () => {
    expect(resetPinRequestSchema.parse({ pin: '3968' })).toEqual({ pin: '3968' });
  });
  it.each([
    {},
    { pin: '123' },
    { pin: 2468 },
    { pin: '3968', pin2: '3968' },
    undefined,
  ])('AC-04: resetPinRequestSchema rechaza %s', (input) => {
    expect(resetPinRequestSchema.safeParse(input).success).toBe(false);
  });
  it.each(['1234', '2512'])(
    'AC-04: resetPinRequestSchema rechaza el PIN fácil %s con el mensaje único',
    (pin) => {
      const result = resetPinRequestSchema.safeParse({ pin });
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.issues.map((issue) => issue.message)).toContain(WEAK_PIN_MESSAGE);
    },
  );

  it('AC-05: adminUserSchema ordena los roles y exige isActive', () => {
    expect(
      adminUserSchema.parse({ ...ADMIN_USER, roles: ['cashier', 'waiter'] }),
    ).toEqual({ ...ADMIN_USER, roles: ['waiter', 'cashier'] });
  });
  it.each([
    { ...ADMIN_USER, id: 0 },
    { ...ADMIN_USER, id: -1 },
    { ...ADMIN_USER, id: 1.5 },
    { ...ADMIN_USER, id: '3' },
    { id: 3, username: 'mozo.juan', displayName: 'Juan', roles: ['waiter'] },
    { ...ADMIN_USER, isActive: 'si' },
    { ...ADMIN_USER, roles: [] },
    { ...ADMIN_USER, roles: ['chef'] },
    { ...ADMIN_USER, pinHash: 'hash' },
    { ...ADMIN_USER, pin_hash: 'hash' },
    { ...ADMIN_USER, pin: '2468' },
    { ...ADMIN_USER, createdAt: '2026-10-08T15:00:00.000Z' },
    { ...ADMIN_USER, sessions: [] },
  ])('AC-05: adminUserSchema rechaza %s', (input) => {
    expect(adminUserSchema.safeParse(input).success).toBe(false);
  });
  it('AC-05: usersResponseSchema acepta listas vacías o con usuarios estrictos', () => {
    expect(usersResponseSchema.parse({ users: [] })).toEqual({ users: [] });
    expect(usersResponseSchema.parse({ users: [ADMIN_USER] }).users).toHaveLength(1);
    expect(
      usersResponseSchema.safeParse({ users: [{ ...ADMIN_USER, pinHash: 'x' }] }).success,
    ).toBe(false);
    expect(usersResponseSchema.safeParse({ users: [], extra: true }).success).toBe(false);
  });

  it('AC-06: ERROR_CODES suma USER_NOT_FOUND y LAST_ADMIN_REQUIRED sin perder los anteriores', () => {
    for (const code of [
      'NOT_FOUND',
      'INTERNAL_ERROR',
      'VALIDATION_ERROR',
      'INVALID_JSON',
      'PAYLOAD_TOO_LARGE',
      'UNSUPPORTED_MEDIA_TYPE',
      'INVALID_BODY',
      'INVALID_CREDENTIALS',
      'UNAUTHENTICATED',
      'FORBIDDEN',
      'TOO_MANY_ATTEMPTS',
      'USERNAME_TAKEN',
      'USER_NOT_FOUND',
      'LAST_ADMIN_REQUIRED',
    ])
      expect(ERROR_CODES).toHaveProperty(code, code);
    expect(errorResponseSchema.safeParse(USER_NOT_FOUND_BODY).success).toBe(true);
    expect(errorResponseSchema.safeParse(LAST_ADMIN_BODY).success).toBe(true);
  });
});
