import { z } from 'zod';

export const USER_ROLES = ['waiter', 'kitchen', 'cashier', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const userRoleSchema = z.enum(USER_ROLES);
export function sortUserRoles(roles: readonly UserRole[]): UserRole[] {
  return [...roles].sort((first, second) => USER_ROLES.indexOf(first) - USER_ROLES.indexOf(second));
}
export function hasAnyRole(
  userRoles: readonly UserRole[],
  allowedRoles: readonly UserRole[],
): boolean {
  return userRoles.some((role) => allowedRoles.includes(role));
}
export const userRolesSchema = z
  .array(userRoleSchema)
  .min(1, 'Elige al menos un rol.')
  .refine((roles) => new Set(roles).size === roles.length, 'No repitas un rol.')
  .transform(sortUserRoles);

export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 6;
export const PIN_PATTERN = /^[0-9]{4,6}$/;
export const pinSchema = z
  .string({ error: 'El PIN debe tener de 4 a 6 dígitos.' })
  .regex(PIN_PATTERN, 'El PIN debe tener de 4 a 6 dígitos.');
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$/;
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    USERNAME_PATTERN,
    'Usa de 3 a 32 caracteres: letras minúsculas sin tilde, números, punto, guion o guion bajo; empieza y termina con letra o número.',
  );
export const DISPLAY_NAME_MAX_LENGTH = 40;
export const DISPLAY_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} .'-]*$/u;
const DISPLAY_NAME_MESSAGE =
  'Usa de 1 a 40 caracteres: letras, números, espacios, punto, apóstrofo o guion; empieza con letra o número.';
export const displayNameSchema = z
  .string()
  .trim()
  .transform((value) => value.normalize('NFC'))
  .pipe(
    z
      .string()
      .min(1, DISPLAY_NAME_MESSAGE)
      .max(DISPLAY_NAME_MAX_LENGTH, DISPLAY_NAME_MESSAGE)
      .regex(DISPLAY_NAME_PATTERN, DISPLAY_NAME_MESSAGE),
  );

export const loginRequestSchema = z.strictObject({ username: usernameSchema, pin: pinSchema });
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export const authUserSchema = z.strictObject({
  id: z.number().int().positive(),
  username: usernameSchema,
  displayName: displayNameSchema,
  roles: userRolesSchema,
});
export type AuthUser = z.infer<typeof authUserSchema>;
export const sessionResponseSchema = z.strictObject({
  user: authUserSchema,
  expiresAt: z.iso.datetime(),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export const loginUserSchema = z.strictObject({
  username: usernameSchema,
  displayName: displayNameSchema,
});
export type LoginUser = z.infer<typeof loginUserSchema>;
export const loginUsersResponseSchema = z.strictObject({ users: z.array(loginUserSchema) });
export type LoginUsersResponse = z.infer<typeof loginUsersResponseSchema>;
