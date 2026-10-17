import { Op, Transaction } from 'sequelize';
import { sortUserRoles, strongPinSchema, updateUserRequestSchema } from '@polleria/shared';
import type { AdminUser, UserRole } from '@polleria/shared';
import { AppError } from '../../errors/app-error.ts';
import type { Models } from '../../models/index.ts';
import type { PinHasher } from '../auth/pin-hasher.ts';
import type { SessionService } from '../auth/session.service.ts';
import type { LoginLimiter } from '../auth/login-limiter.ts';

export interface UserAdminService {
  listUsers(): Promise<AdminUser[]>;
  updateUser(userId: number, input: unknown): Promise<AdminUser>;
  resetUserPin(userId: number, pin: unknown): Promise<void>;
}

export function createUserNotFoundError(): AppError {
  return new AppError({
    code: 'USER_NOT_FOUND',
    message: 'Ese usuario no existe.',
    httpStatus: 404,
  });
}
export function createLastAdminRequiredError(): AppError {
  return new AppError({
    code: 'LAST_ADMIN_REQUIRED',
    message: 'Debe quedar al menos un administrador activo.',
    httpStatus: 409,
  });
}

function toAdminUser(user: {
  id: number;
  username: string;
  displayName: string;
  roles: UserRole[];
  isActive: boolean;
}): AdminUser {
  const { id, username, displayName, roles, isActive } = user;
  return { id, username, displayName, roles: sortUserRoles(roles), isActive };
}

/**
 * Servicio de administración de usuarios (spec 004, D-004-04 a D-004-08).
 *
 * `sessionService` forma parte del contrato del servicio aunque no se llame: las sesiones
 * se borran con `models.Session.destroy` dentro de la misma transacción que actualiza al
 * usuario (D-004-05); el servicio de sesiones solo borra por token, no por usuario.
 */
export function createUserAdminService(deps: {
  models: Models;
  pinHasher: PinHasher;
  sessionService: SessionService;
  loginLimiter: LoginLimiter;
}): UserAdminService {
  const { models, pinHasher, loginLimiter } = deps;
  const sequelize = models.User.sequelize;
  if (sequelize === undefined)
    throw new Error('Los modelos no están vinculados a una conexión de Sequelize.');
  const collator = new Intl.Collator('es', { sensitivity: 'base' });
  return {
    async listUsers() {
      const users = await models.User.findAll({
        attributes: ['id', 'username', 'displayName', 'roles', 'isActive'],
      });
      return users
        .map((user) => toAdminUser(user))
        .sort(
          (first, second) =>
            collator.compare(first.displayName, second.displayName) ||
            first.username.localeCompare(second.username),
        );
    },
    async updateUser(userId, input) {
      const changes = updateUserRequestSchema.parse(input);
      // Marca para saber, fuera de la transacción, si hay que limpiar el conteo de intentos.
      let shouldClearAttempts = false;
      const updated = await sequelize.transaction(async (transaction) => {
        // Guardia del último administrador (D-004-04): se bloquean PRIMERO las filas de
        // los administradores activos con FOR UPDATE, así dos operaciones simultáneas se
        // serializan y no pueden dejar el sistema sin administrador. La fila objetivo se
        // lee y bloquea DESPUÉS, dentro de la región serializada: leerla antes del
        // bloqueo la exponía a quedar obsoleta frente a escritores concurrentes (TOCTOU)
        // y a devolver campos viejos en la respuesta.
        const activeAdmins = await models.User.findAll({
          where: { isActive: true, roles: { [Op.contains]: ['admin'] } },
          attributes: ['id'],
          order: [['id', 'ASC']],
          lock: Transaction.LOCK.UPDATE,
          transaction,
        });
        const user = await models.User.findByPk(userId, {
          lock: Transaction.LOCK.UPDATE,
          transaction,
        });
        if (user === null) throw createUserNotFoundError();
        const wasActive = user.isActive;
        const nextIsActive = changes.isActive ?? wasActive;
        const nextRoles = changes.roles ?? user.roles;
        const wasActiveAdmin = wasActive && user.roles.includes('admin');
        const willBeActiveAdmin = nextIsActive && nextRoles.includes('admin');
        if (wasActiveAdmin && !willBeActiveAdmin && activeAdmins.length <= 1)
          throw createLastAdminRequiredError();
        const updates: { displayName?: string; roles?: UserRole[]; isActive?: boolean } = {};
        if (changes.displayName !== undefined) updates.displayName = changes.displayName;
        if (changes.roles !== undefined) updates.roles = changes.roles;
        if (changes.isActive !== undefined) updates.isActive = changes.isActive;
        await user.update(updates, { transaction });
        // D-004-05: si el usuario queda inactivo, sus sesiones mueren en la transacción.
        const endedUpInactive = nextIsActive === false;
        if (endedUpInactive) await models.Session.destroy({ where: { userId }, transaction });
        // El conteo de intentos se limpia tras confirmar cuando el usuario queda
        // inactivo (D-004-05, idempotente si ya lo estaba) y también cuando un inactivo
        // vuelve a estar activo: los intentos que acumuló mientras estaba inactivo no
        // deben sobrevivir a la reactivación, o el PIN correcto recibiría un 429.
        const wasReactivated = wasActive === false && nextIsActive === true;
        shouldClearAttempts = endedUpInactive || wasReactivated;
        return toAdminUser(user);
      });
      if (shouldClearAttempts) loginLimiter.clearAttempts(userId);
      return updated;
    },
    async resetUserPin(userId, pin) {
      const parsedPin = strongPinSchema.parse(pin);
      const pinHash = await pinHasher.hash(parsedPin);
      await sequelize.transaction(async (transaction) => {
        // La fila se lee con bloqueo dentro de la transacción (misma corrección TOCTOU
        // de updateUser): el hash y el borrado de sesiones se aplican sobre la fila real.
        const user = await models.User.findByPk(userId, {
          lock: Transaction.LOCK.UPDATE,
          transaction,
        });
        if (user === null) throw createUserNotFoundError();
        await user.update({ pinHash }, { transaction });
        await models.Session.destroy({ where: { userId }, transaction });
      });
      loginLimiter.clearAttempts(userId);
    },
  };
}
