import { Op } from 'sequelize';
import { sortUserRoles } from '@polleria/shared';
import type { AuthUser } from '@polleria/shared';
import type { Models, SessionAttributes, UserAttributes } from '../../models/index.ts';
import { SESSION_TOKEN_PATTERN, generateSessionToken, hashSessionToken } from './session-token.ts';

export const SESSION_DURATION_MS = 57600000;
export interface AuthContext {
  sessionId: number;
  user: AuthUser;
  expiresAt: Date;
}
export interface SessionService {
  createSession(userId: number): Promise<{ token: string; expiresAt: Date }>;
  resolveSession(token: string | undefined): Promise<AuthContext | null>;
  deleteSession(token: string | undefined): Promise<void>;
  deleteExpiredSessions(): Promise<number>;
}
export function createSessionService({
  models,
  now = () => new Date(),
}: {
  models: Models;
  now?: () => Date;
}): SessionService {
  return {
    async createSession(userId) {
      const token = generateSessionToken();
      const expiresAt = new Date(now().getTime() + SESSION_DURATION_MS);
      await models.Session.create({ userId, tokenHash: hashSessionToken(token), expiresAt });
      return { token, expiresAt };
    },
    async resolveSession(token) {
      if (token === undefined || !SESSION_TOKEN_PATTERN.test(token)) return null;
      const session = await models.Session.findOne({
        where: { tokenHash: hashSessionToken(token), expiresAt: { [Op.gt]: now() } },
        include: [
          {
            model: models.User,
            as: 'user',
            required: true,
            where: { isActive: true },
            attributes: ['id', 'username', 'displayName', 'roles'],
          },
        ],
      });
      if (session === null) return null;
      const record = session.get({ plain: true }) as SessionAttributes & { user: UserAttributes };
      const { id, username, displayName, roles } = record.user;
      return {
        sessionId: record.id,
        user: { id, username, displayName, roles: sortUserRoles(roles) },
        expiresAt: record.expiresAt,
      };
    },
    async deleteSession(token) {
      if (token !== undefined && SESSION_TOKEN_PATTERN.test(token))
        await models.Session.destroy({ where: { tokenHash: hashSessionToken(token) } });
    },
    deleteExpiredSessions() {
      return models.Session.destroy({ where: { expiresAt: { [Op.lte]: now() } } });
    },
  };
}
