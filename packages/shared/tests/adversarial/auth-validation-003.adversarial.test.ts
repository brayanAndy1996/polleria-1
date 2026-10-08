import { describe, expect, it } from 'vitest';
import {
  DISPLAY_NAME_PATTERN,
  USER_ROLES,
  displayNameSchema,
  hasAnyRole,
  loginRequestSchema,
  pinSchema,
  sessionResponseSchema,
  userRolesSchema,
} from '../../src/index.ts';

const session = {
  user: { id: 1, username: 'mozo.juan', displayName: 'Juan', roles: ['waiter'] },
  expiresAt: '2026-10-09T07:00:00.000Z',
};

describe('003: validación adversarial independiente', () => {
  it.each(['\n', '\r', '\r\n', '\u2028', '\u2029', '\u0000'])(
    'ADV-003-07: el PIN no acepta terminadores de línea ni NUL %j (AC-01/AC-15)',
    (suffix) => {
      expect(pinSchema.safeParse(`2468${suffix}`).success).toBe(false);
      expect(
        loginRequestSchema.safeParse({ username: 'mozo.juan', pin: `2468${suffix}` }).success,
      ).toBe(false);
    },
  );

  it.each([21, 40])(
    'ADV-003-08: el límite del nombre cuenta %i puntos de código, no unidades UTF-16 (AC-03)',
    (length) => {
      const name = '\u{10400}'.repeat(length);
      expect(Array.from(name)).toHaveLength(length);
      expect(DISPLAY_NAME_PATTERN.test(name)).toBe(true);
      const parsed = displayNameSchema.safeParse(name);
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data).toBe(name);
      expect(displayNameSchema.safeParse('\u{10400}'.repeat(41)).success).toBe(false);
    },
  );

  it('ADV-003-09: los quince conjuntos de roles congelados se validan sin mutación ni admin implícito (AC-40)', () => {
    for (let mask = 1; mask < 1 << USER_ROLES.length; mask += 1) {
      const roles = Object.freeze(
        USER_ROLES.filter((_role, index) => mask & (1 << index)).reverse(),
      );
      const original = [...roles];
      const parsed = userRolesSchema.parse(roles);
      expect(parsed).toEqual(USER_ROLES.filter((role) => roles.includes(role)));
      expect(roles).toEqual(original);
      expect(parsed).not.toBe(roles);
      for (const required of USER_ROLES)
        expect(hasAnyRole(parsed, [required])).toBe(roles.includes(required));
    }
    for (const roles of [
      new Array<unknown>(1),
      [['admin']],
      { 0: 'admin', length: 1 },
      ['admin', 'admin'],
    ]) {
      expect(userRolesSchema.safeParse(roles).success).toBe(false);
      expect(
        sessionResponseSchema.safeParse({ ...session, user: { ...session.user, roles } }).success,
      ).toBe(false);
    }
  });
});
