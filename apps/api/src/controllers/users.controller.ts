import {
  createUserRequestSchema,
  resetPinRequestSchema,
  updateUserRequestSchema,
} from '@polleria/shared';
import type { RequestHandler } from 'express';
import type { UserService } from '../services/users/user.service.ts';
import type { UserAdminService } from '../services/users/user-admin.service.ts';
import { parseIdParam } from './id-param.ts';

export interface UsersController {
  list: RequestHandler;
  create: RequestHandler;
  update: RequestHandler;
  resetPin: RequestHandler;
}

const USER_ID_MESSAGE = 'El identificador del usuario no es válido.';

/**
 * Convierte el parámetro `userId` de la ruta en un entero positivo (D-004-06):
 * la regla compartida de parseIdParam con el mensaje propio del parámetro.
 */
function parseUserIdParam(raw: string | string[] | undefined): number {
  return parseIdParam(raw, 'userId', USER_ID_MESSAGE);
}

export function createUsersController({
  userService,
  userAdminService,
}: {
  userService: UserService;
  userAdminService: UserAdminService;
}): UsersController {
  return {
    list: async (_req, res) => {
      res.json({ users: await userAdminService.listUsers() });
    },
    create: async (req, res, next) => {
      try {
        const input = createUserRequestSchema.parse(req.body);
        // El PIN ya salió validado por strongPinSchema: createUserService solo lo vuelve a
        // revisar por formato (inocuo, D-004-08). Un usuario recién creado siempre es activo.
        const user = await userService.createUser(input);
        res.status(201).json({ ...user, isActive: true });
      } catch (error) {
        next(error);
      }
    },
    update: async (req, res, next) => {
      try {
        const userId = parseUserIdParam(req.params['userId']);
        const input = updateUserRequestSchema.parse(req.body);
        res.json(await userAdminService.updateUser(userId, input));
      } catch (error) {
        next(error);
      }
    },
    resetPin: async (req, res, next) => {
      try {
        const userId = parseUserIdParam(req.params['userId']);
        const { pin } = resetPinRequestSchema.parse(req.body);
        await userAdminService.resetUserPin(userId, pin);
        res.status(204).end();
      } catch (error) {
        next(error);
      }
    },
  };
}
