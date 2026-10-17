import { sortUserRoles } from '@polleria/shared';
import type { LoginRequest, LoginUser, SessionResponse } from '@polleria/shared';
import { AppError } from '../../errors/app-error.ts';
import type { Models } from '../../models/index.ts';
import type { PinHasher } from './pin-hasher.ts';
import type { LoginLimiter } from './login-limiter.ts';
import type { SessionService } from './session.service.ts';

export interface AuthService {
  listLoginUsers(): Promise<LoginUser[]>;
  login(input: LoginRequest): Promise<{ token: string; session: SessionResponse }>;
  logout(token: string | undefined): Promise<void>;
}
function invalidCredentials(): AppError {
  return new AppError({
    code: 'INVALID_CREDENTIALS',
    message: 'Usuario o PIN incorrecto.',
    httpStatus: 401,
  });
}
export function createAuthService({
  models,
  sessionService,
  pinHasher,
  loginLimiter,
}: {
  models: Models;
  sessionService: SessionService;
  pinHasher: PinHasher;
  loginLimiter: LoginLimiter;
}): AuthService {
  const dummyHash = pinHasher.hash('000000');
  void dummyHash.catch(() => undefined);
  const collator = new Intl.Collator('es', { sensitivity: 'base' });
  return {
    async listLoginUsers() {
      const users = await models.User.findAll({
        where: { isActive: true },
        attributes: ['username', 'displayName'],
      });
      return users
        .map(({ username, displayName }) => ({ username, displayName }))
        .sort(
          (first, second) =>
            collator.compare(first.displayName, second.displayName) ||
            first.username.localeCompare(second.username),
        );
    },
    async login(input) {
      const user = await models.User.findOne({ where: { username: input.username } });
      if (user === null) {
        await pinHasher.verify(input.pin, await dummyHash);
        throw invalidCredentials();
      }
      const retryAfterSeconds = loginLimiter.getRetryAfterSeconds(user.id);
      if (retryAfterSeconds !== null)
        throw new AppError({
          code: 'TOO_MANY_ATTEMPTS',
          message: 'Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.',
          httpStatus: 429,
          details: { retryAfterSeconds },
        });
      loginLimiter.registerAttempt(user.id);
      const verified = await pinHasher.verify(input.pin, user.pinHash);
      if (!verified || !user.isActive) throw invalidCredentials();
      await sessionService.deleteExpiredSessions();
      const { token, expiresAt } = await sessionService.createSession(user.id);
      loginLimiter.registerSuccess(user.id);
      return {
        token,
        session: {
          user: {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            roles: sortUserRoles(user.roles),
          },
          expiresAt: expiresAt.toISOString(),
        },
      };
    },
    logout: (token) => sessionService.deleteSession(token),
  };
}
