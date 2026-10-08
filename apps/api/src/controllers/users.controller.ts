import {
  ERROR_CODES,
  createUserRequestSchema,
  resetPinRequestSchema,
  updateUserRequestSchema,
} from '@polleria/shared';
import type { RequestHandler } from 'express';
import { AppError } from '../errors/app-error.ts';
import type { UserService } from '../services/users/user.service.ts';
import type { UserAdminService } from '../services/users/user-admin.service.ts';

export interface UsersController {
  list: RequestHandler;
  create: RequestHandler;
  update: RequestHandler;
  resetPin: RequestHandler;
}

const USER_ID_MESSAGE = 'El identificador del usuario no es válido.';
/** Máximo del tipo INTEGER de PostgreSQL (spec 004, D-004-06). */
const USER_ID_MAX = 2147483647;

/**
 * Convierte el parámetro `userId` de la ruta en un entero positivo: ^[0-9]+$ y entre 1 y
 * 2147483647. Cualquier otra cosa ('abc', '0', '1.5', '-3', números enormes o un parámetro
 * repetido) es un VALIDATION_ERROR con el issue en `userId` (D-004-06).
 */
function parseUserIdParam(raw: string | string[] | undefined): number {
  const userId = typeof raw === 'string' && /^[0-9]+$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(userId) || userId < 1 || userId > USER_ID_MAX)
    throw new AppError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Los datos enviados no son válidos.',
      httpStatus: 400,
      details: { issues: [{ path: 'userId', message: USER_ID_MESSAGE }] },
    });
  return userId;
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
