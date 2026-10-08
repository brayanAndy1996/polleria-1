import { describe, expect, it } from 'vitest';
import {
  USER_ROLES,
  PIN_PATTERN,
  PIN_MIN_LENGTH,
  PIN_MAX_LENGTH,
  USERNAME_PATTERN,
  DISPLAY_NAME_MAX_LENGTH,
  userRoleSchema,
  userRolesSchema,
  sortUserRoles,
  hasAnyRole,
  pinSchema,
  usernameSchema,
  displayNameSchema,
  loginRequestSchema,
  sessionResponseSchema,
  loginUsersResponseSchema,
  ERROR_CODES,
  errorResponseSchema,
} from './index.ts';

const PIN_MESSAGE = 'El PIN debe tener de 4 a 6 dígitos.';
const USERNAME_MESSAGE =
  'Usa de 3 a 32 caracteres: letras minúsculas sin tilde, números, punto, guion o guion bajo; empieza y termina con letra o número.';
const NAME_MESSAGE =
  'Usa de 1 a 40 caracteres: letras, números, espacios, punto, apóstrofo o guion; empieza con letra o número.';
const USER = { id: 1, username: 'mozo.juan', displayName: 'Juan', roles: ['waiter'] };
const SESSION = { user: USER, expiresAt: '2026-10-09T07:00:00.000Z' };

describe('003: esquemas de usuarios y sesión', () => {
  it('AC-01: roles y constantes del PIN mantienen el contrato', () => {
    expect(USER_ROLES).toEqual(['waiter', 'kitchen', 'cashier', 'admin']);
    for (const role of USER_ROLES) expect(userRoleSchema.parse(role)).toBe(role);
    for (const role of ['Admin', 'chef', '', null])
      expect(userRoleSchema.safeParse(role).success).toBe(false);
    expect(PIN_PATTERN).toEqual(/^[0-9]{4,6}$/);
    expect([PIN_MIN_LENGTH, PIN_MAX_LENGTH]).toEqual([4, 6]);
  });
  it.each(['0000', '0007', '1234', '12345', '123456'])(
    'AC-01: conserva el PIN válido %s',
    (pin) => {
      expect(pinSchema.parse(pin)).toBe(pin);
    },
  );
  it.each([
    '123',
    '1234567',
    '12a4',
    ' 1234',
    '1234 ',
    '12 34',
    '\u0661\u0662\u0663\u0664',
    '\uFF11\uFF12\uFF13\uFF14',
    '',
    1234,
    null,
  ])('AC-01: rechaza el PIN inválido %s', (pin) => {
    const result = pinSchema.safeParse(pin);
    expect(result.success).toBe(false);
    if (!result.success && typeof pin === 'string')
      expect(result.error.issues.map((issue) => issue.message)).toContain(PIN_MESSAGE);
  });
  it('AC-02: normaliza el usuario y exporta el patrón exacto', () => {
    expect(usernameSchema.parse(' Dueno ')).toBe('dueno');
    expect(usernameSchema.parse('MOZO.Juan')).toBe('mozo.juan');
    expect(USERNAME_PATTERN).toEqual(/^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$/);
    for (const value of ['abc', 'a'.repeat(32), 'caja_1', 'ana-maria', 'mozo.juan', '007'])
      expect(usernameSchema.parse(value)).toBe(value);
  });
  it.each([
    'ab',
    'a'.repeat(33),
    'juan perez',
    'josé',
    'JOSÉ',
    'ñandu',
    '.juan',
    'juan.',
    '_ana',
    'ana-',
    'mozo@1',
    '',
    '   ',
  ])('AC-02: rechaza el nombre de usuario %s', (value) => {
    const result = usernameSchema.safeParse(value);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.map((issue) => issue.message)).toContain(USERNAME_MESSAGE);
  });
  it('AC-03: recorta y normaliza el nombre en NFC', () => {
    expect(DISPLAY_NAME_MAX_LENGTH).toBe(40);
    expect(displayNameSchema.parse('  Don Carlos  ')).toBe('Don Carlos');
    expect(displayNameSchema.parse('Jose\u0301')).toBe('José');
    expect(displayNameSchema.parse('  Juan\u00A0')).toBe('Juan');
    for (const value of [
      'María José',
      "O'Brien",
      'Juan P.',
      'Ana-Lucía',
      'Mozo 2',
      'Ñandú',
      'x'.repeat(40),
      'a\u0301'.repeat(40),
    ])
      expect(displayNameSchema.parse(value)).toBe(value.normalize('NFC'));
  });
  it.each([
    '',
    '   ',
    'x'.repeat(41),
    '.Juan',
    'Juan\tPérez',
    'Juan\nPérez',
    'Juan\u00A0Pérez',
    'Pollo \u{1F357}',
    'Ana<b>',
    'Ana\u200B',
  ])('AC-03: rechaza el nombre para mostrar %s', (value) => {
    const result = displayNameSchema.safeParse(value);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.map((issue) => issue.message)).toContain(NAME_MESSAGE);
  });
  it('AC-04: el login es estricto y normaliza el usuario', () => {
    expect(loginRequestSchema.parse({ username: ' Mozo.Juan ', pin: '0007' })).toEqual({
      username: 'mozo.juan',
      pin: '0007',
    });
    for (const value of [
      { pin: '0007' },
      { username: 'mozo.juan' },
      { username: 'mozo.juan', pin: 7 },
      { username: 'ab', pin: '0007' },
      { username: 'mozo.juan', pin: '0007', role: 'admin' },
      undefined,
    ])
      expect(loginRequestSchema.safeParse(value).success).toBe(false);
  });
  it('AC-04: las respuestas son estrictas y no exponen campos privados', () => {
    expect(sessionResponseSchema.parse(SESSION)).toEqual(SESSION);
    expect(
      sessionResponseSchema.parse({ ...SESSION, user: { ...USER, roles: ['cashier', 'waiter'] } })
        .user.roles,
    ).toEqual(['waiter', 'cashier']);
    for (const user of [
      { ...USER, pinHash: 'hash' },
      { ...USER, role: 'waiter' },
      { id: 1, username: 'mozo.juan', displayName: 'Juan', role: 'waiter' },
      ...[[], ['chef'], ['waiter', 'waiter']].map((roles) => ({ ...USER, roles })),
      ...[0, -1, 1.5, '1'].map((id) => ({ ...USER, id })),
    ])
      expect(sessionResponseSchema.safeParse({ ...SESSION, user }).success).toBe(false);
    expect(sessionResponseSchema.safeParse({ ...SESSION, extra: true }).success).toBe(false);
    expect(
      sessionResponseSchema.safeParse({ ...SESSION, expiresAt: '2026-10-09T02:00:00.000-05:00' })
        .success,
    ).toBe(false);
    expect(loginUsersResponseSchema.parse({ users: [] })).toEqual({ users: [] });
    expect(
      loginUsersResponseSchema.parse({ users: [{ username: 'mozo.juan', displayName: 'Juan' }] })
        .users,
    ).toHaveLength(1);
    for (const extra of [{ roles: ['waiter'] }, { role: 'waiter' }, { id: 1 }])
      expect(
        loginUsersResponseSchema.safeParse({
          users: [{ username: 'mozo.juan', displayName: 'Juan', ...extra }],
        }).success,
      ).toBe(false);
  });
  it('AC-04: agrega los códigos de autenticación sin romper los errores comunes', () => {
    for (const code of [
      'INVALID_CREDENTIALS',
      'UNAUTHENTICATED',
      'FORBIDDEN',
      'TOO_MANY_ATTEMPTS',
      'USERNAME_TAKEN',
    ])
      expect(ERROR_CODES).toHaveProperty(code, code);
    expect(
      errorResponseSchema.safeParse({
        error: {
          code: 'TOO_MANY_ATTEMPTS',
          message: 'Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.',
          details: { retryAfterSeconds: 900 },
        },
      }).success,
    ).toBe(true);
  });
  it('AC-40: ordena los roles sin modificar la entrada y autoriza por intersección', () => {
    const input = ['admin', 'cashier', 'kitchen', 'waiter'] as const;
    expect(userRolesSchema.parse(input)).toEqual(USER_ROLES);
    expect(input).toEqual(['admin', 'cashier', 'kitchen', 'waiter']);
    const roles = ['admin', 'kitchen'] as const;
    expect(sortUserRoles(roles)).toEqual(['kitchen', 'admin']);
    expect(sortUserRoles(roles)).not.toBe(roles);
    expect(hasAnyRole(['waiter', 'cashier'], ['cashier', 'admin'])).toBe(true);
    expect(hasAnyRole(['waiter'], ['cashier', 'admin'])).toBe(false);
    expect(hasAnyRole(['admin'], ['waiter'])).toBe(false);
    expect(hasAnyRole(['waiter'], [])).toBe(false);
  });
  it.each([
    [[], 'Elige al menos un rol.'],
    [['waiter', 'waiter'], 'No repitas un rol.'],
    [['cashier', 'waiter', 'cashier'], 'No repitas un rol.'],
  ])('AC-40: rechaza conjuntos vacíos o repetidos %s', (roles, message) => {
    const result = userRolesSchema.safeParse(roles);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.map((issue) => issue.message)).toContain(message);
  });
  it.each(
    [['chef'], ['Admin'], ['waiter', null], 'waiter', null, undefined].map((roles) => [roles]),
  )('AC-40: rechaza el conjunto inválido %s', (roles) => {
    expect(userRolesSchema.safeParse(roles).success).toBe(false);
  });
});
