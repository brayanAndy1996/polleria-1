import { UniqueConstraintError } from 'sequelize';
import {
  displayNameSchema,
  pinSchema,
  sortUserRoles,
  usernameSchema,
  userRolesSchema,
} from '@polleria/shared';
import type { AuthUser, UserRole } from '@polleria/shared';
import { AppError } from '../../errors/app-error.ts';
import type { Models } from '../../models/index.ts';
import type { PinHasher } from '../auth/pin-hasher.ts';

// La administración de usuarios de la spec 004 vive en el módulo hermano; se reexporta
// aquí porque es la entrada del módulo users (las pruebas y app.ts importan de aquí).
export { createUserAdminService } from './user-admin.service.ts';
export type { UserAdminService } from './user-admin.service.ts';

export interface CreateUserInput {
  username: string;
  displayName: string;
  pin: string;
  roles: UserRole[];
}
export interface UserService {
  createUser(input: CreateUserInput): Promise<AuthUser>;
}
export function createUsernameTakenError(): AppError {
  return new AppError({
    code: 'USERNAME_TAKEN',
    message: 'Ese nombre de usuario ya existe.',
    httpStatus: 409,
  });
}
export function createUserService({
  models,
  pinHasher,
}: {
  models: Models;
  pinHasher: PinHasher;
}): UserService {
  return {
    async createUser(input) {
      const username = usernameSchema.parse(input.username);
      const displayName = displayNameSchema.parse(input.displayName);
      const pin = pinSchema.parse(input.pin);
      const roles = userRolesSchema.parse(input.roles);
      const pinHash = await pinHasher.hash(pin);
      try {
        const user = await models.User.create({ username, displayName, pinHash, roles });
        return {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          roles: sortUserRoles(user.roles),
        };
      } catch (error) {
        if (error instanceof UniqueConstraintError) throw createUsernameTakenError();
        throw error;
      }
    },
  };
}
