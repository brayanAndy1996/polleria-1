import { createHash, randomBytes } from 'node:crypto';

export const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
