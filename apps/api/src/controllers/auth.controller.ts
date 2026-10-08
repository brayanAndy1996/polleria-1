import { loginRequestSchema } from '@polleria/shared';
import type { RequestHandler } from 'express';
import { AppError } from '../errors/app-error.ts';
import { clearSessionCookie, readSessionCookie, setSessionCookie } from '../http/session-cookie.ts';
import { createUnauthenticatedError, getAuthContext } from '../middlewares/auth.ts';
import type { AuthService } from '../services/auth/auth.service.ts';

export interface AuthController {
  listUsers: RequestHandler;
  login: RequestHandler;
  me: RequestHandler;
  logout: RequestHandler;
}
export function createAuthController({
  authService,
}: {
  authService: AuthService;
}): AuthController {
  return {
    listUsers: async (_req, res) => {
      res.json({ users: await authService.listLoginUsers() });
    },
    login: async (req, res, next) => {
      try {
        const input = loginRequestSchema.parse(req.body as unknown);
        const { token, session } = await authService.login(input);
        setSessionCookie(res, token);
        res.json(session);
      } catch (error) {
        if (
          error instanceof AppError &&
          error.code === 'TOO_MANY_ATTEMPTS' &&
          typeof error.details?.retryAfterSeconds === 'number'
        )
          res.set('Retry-After', String(error.details.retryAfterSeconds));
        next(error);
      }
    },
    me: (_req, res) => {
      const context = getAuthContext(res);
      if (context === undefined) throw createUnauthenticatedError();
      res.json({ user: context.user, expiresAt: context.expiresAt.toISOString() });
    },
    logout: async (req, res) => {
      await authService.logout(readSessionCookie(req.headers.cookie));
      clearSessionCookie(res);
      res.status(204).end();
    },
  };
}
