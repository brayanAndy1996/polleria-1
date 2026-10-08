import { z } from 'zod';
import {
  PIN_PATTERN,
  displayNameSchema,
  pinSchema,
  usernameSchema,
  userRolesSchema,
} from './auth.ts';

/**
 * Mensaje único con el que se rechaza un PIN fácil (D-004-02). Viaja como issue de
 * VALIDATION_ERROR en el campo `pin` al crear un usuario o restablecer su PIN.
 */
export const WEAK_PIN_MESSAGE = 'Ese PIN es muy fácil de adivinar. Elige otro.';

/** PIN fáciles que ninguna regla mecánica cubre: la columna del medio del teclado numérico. */
const WEAK_PIN_LIST = new Set(['2580']);

/** Todos los dígitos iguales (0000, 1111, 55555, 999999). */
function isRepeatedPin(pin: string): boolean {
  return new Set(pin).size === 1;
}

/**
 * Cada dígito es el anterior + step, en módulo 10. Con step 1 rechaza las corridas
 * ascendentes (1234, 23456) y con -1 las descendentes (4321, 654321); al ser circular
 * también rechaza las que cruzan el 9 -> 0: 7890, 8901, 0987, 2109.
 */
function isCircularSequence(pin: string, step: 1 | -1): boolean {
  for (let index = 1; index < pin.length; index += 1) {
    const previous = pin.charCodeAt(index - 1) - 48;
    const current = pin.charCodeAt(index) - 48;
    if ((previous + step + 10) % 10 !== current) return false;
  }
  return true;
}

/** PIN de 4 dígitos entre 1900 y 2099 (años de nacimiento, del negocio, del matrimonio). */
function isYearPin(pin: string): boolean {
  if (pin.length !== 4) return false;
  const year = Number(pin);
  return year >= 1900 && year <= 2099;
}

/**
 * Fecha evidente: DDMM con 4 dígitos (2512 = 25 de diciembre) o DDMMAA con 6
 * (150385 = 15/03/85). Solo revisa día 01 a 31 y mes 01 a 12, sin verificar el día real
 * del mes (3102 vale como fecha). Los PIN de 5 dígitos no representan una fecha.
 */
function isDatePin(pin: string): boolean {
  if (pin.length !== 4 && pin.length !== 6) return false;
  const day = Number(pin.slice(0, 2));
  const month = Number(pin.slice(2, 4));
  return day >= 1 && day <= 31 && month >= 1 && month <= 12;
}

/**
 * Indica si un PIN es fácil de adivinar según la lista de D-004-02: dígitos repetidos,
 * corridas circulares en ambos sentidos, años 1900-2099, fechas DDMM o DDMMAA válidas y
 * '2580'. Función pura que nunca lanza: devuelve false para cualquier entrada que no
 * cumpla ^[0-9]{4,6}$ (el formato lo revisa pinSchema antes).
 */
export function isWeakPin(pin: string): boolean {
  if (typeof pin !== 'string' || !PIN_PATTERN.test(pin)) return false;
  return (
    WEAK_PIN_LIST.has(pin) ||
    isRepeatedPin(pin) ||
    isCircularSequence(pin, 1) ||
    isCircularSequence(pin, -1) ||
    isYearPin(pin) ||
    isDatePin(pin)
  );
}

/**
 * pinSchema más la regla de PIN fáciles (D-004-02). Se usa al crear un usuario y al
 * restablecer un PIN, nunca al iniciar sesión: un PIN débil creado antes de esta regla
 * debe seguir sirviendo para entrar, así que pinSchema no cambia.
 */
export const strongPinSchema = pinSchema.refine((pin) => !isWeakPin(pin), WEAK_PIN_MESSAGE);

/** Cuerpo de POST /api/users: alta de un trabajador por el administrador. */
export const createUserRequestSchema = z.strictObject({
  username: usernameSchema,
  displayName: displayNameSchema,
  pin: strongPinSchema,
  roles: userRolesSchema,
});
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

/**
 * Cuerpo de PATCH /api/users/{userId}: nombre visible, roles y estado activo, todos
 * opcionales pero con al menos una propiedad ('No indicaste ningún cambio.'). El PIN no
 * se cambia aquí (va por POST /api/users/{userId}/pin) ni el nombre de usuario jamás.
 */
export const updateUserRequestSchema = z
  .strictObject({
    displayName: displayNameSchema.optional(),
    roles: userRolesSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (fields) => Object.values(fields).some((value) => value !== undefined),
    'No indicaste ningún cambio.',
  );
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;

/** Cuerpo de POST /api/users/{userId}/pin: el PIN nuevo, fuerte. */
export const resetPinRequestSchema = z.strictObject({ pin: strongPinSchema });
export type ResetPinRequest = z.infer<typeof resetPinRequestSchema>;

/** Un usuario tal como lo ve el administrador. Nunca incluye el PIN ni su hash. */
export const adminUserSchema = z.strictObject({
  id: z.number().int().positive(),
  username: usernameSchema,
  displayName: displayNameSchema,
  roles: userRolesSchema,
  isActive: z.boolean(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

/** Respuesta de GET /api/users: todos los usuarios, activos e inactivos. */
export const usersResponseSchema = z.strictObject({ users: z.array(adminUserSchema) });
export type UsersResponse = z.infer<typeof usersResponseSchema>;
