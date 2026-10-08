import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SESSION_TOKEN_PATTERN, generateSessionToken, hashSessionToken } from './session-token.ts';

describe('003: token de sesión', () => {
  it('AC-10: genera tokens únicos y guarda un SHA-256 determinista', () => {
    expect(SESSION_TOKEN_PATTERN).toEqual(/^[A-Za-z0-9_-]{43}$/);
    const tokens = Array.from({ length: 1000 }, () => generateSessionToken());
    expect(new Set(tokens).size).toBe(1000);
    for (const token of tokens) expect(token).toMatch(SESSION_TOKEN_PATTERN);
    const token = tokens[0]!;
    const hash = hashSessionToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(createHash('sha256').update(token, 'utf8').digest('hex'));
    expect(hashSessionToken(token)).toBe(hash);
  });
});
