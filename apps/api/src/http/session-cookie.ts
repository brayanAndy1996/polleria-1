import type { CookieOptions, Response } from 'express';
import { SESSION_DURATION_MS } from '../services/auth/session.service.ts';

export const SESSION_COOKIE_NAME = 'polleria_session';
const COOKIE_OPTIONS: CookieOptions = { httpOnly: true, sameSite: 'strict', path: '/' };
export function readSessionCookie(cookieHeader: string | undefined): string | undefined {
  for (const entry of cookieHeader?.split(';') ?? []) {
    const separator = entry.indexOf('=');
    if (separator >= 0 && entry.slice(0, separator).trim() === SESSION_COOKIE_NAME)
      return entry.slice(separator + 1).trim() || undefined;
  }
  return undefined;
}
export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, { ...COOKIE_OPTIONS, maxAge: SESSION_DURATION_MS });
}
export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, COOKIE_OPTIONS);
}
