import { hasAnyRole } from '@polleria/shared';
import type { UserRole } from '@polleria/shared';
import type { RequestHandler, Response } from 'express';
import { AppError } from '../errors/app-error.ts';
import { readSessionCookie } from '../http/session-cookie.ts';
import type { AuthContext, SessionService } from '../services/auth/session.service.ts';

export function createUnauthenticatedError(): AppError {
  return new AppError({
    code: 'UNAUTHENTICATED',
    message: 'Debes iniciar sesión para continuar.',
    httpStatus: 401,
  });
}
export function getAuthContext(res: Response): AuthContext | undefined {
  const context: unknown = res.locals.auth;
  return context as AuthContext | undefined;
}
export function createRequireAuth({
  sessionService,
}: {
  sessionService: SessionService;
}): RequestHandler {
  return async (req, res, next) => {
    const context = await sessionService.resolveSession(readSessionCookie(req.headers.cookie));
    if (context === null) {
      next(createUnauthenticatedError());
      return;
    }
    res.locals.auth = context;
    next();
  };
}
export function requireRole(...roles: UserRole[]): RequestHandler {
  if (roles.length === 0) throw new Error('requireRole necesita al menos un rol.');
  return (_req, res, next) => {
    const context = getAuthContext(res);
    if (context === undefined) {
      next(createUnauthenticatedError());
      return;
    }
    next(
      hasAnyRole(context.user.roles, roles)
        ? undefined
        : new AppError({
            code: 'FORBIDDEN',
            message: 'No tienes permiso para realizar esta acción.',
            httpStatus: 403,
          }),
    );
  };
}
