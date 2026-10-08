import { describe, expect, it } from 'vitest';
import {
  LOGIN_LOCK_DURATION_MS,
  MAX_FAILED_LOGIN_ATTEMPTS,
  createLoginLimiter,
} from './login-limiter.ts';

describe('003: límite de intentos', () => {
  it('AC-09: cuenta por usuario, redondea el tiempo y repite el bloqueo hasta un éxito', () => {
    const start = Date.parse('2026-10-08T15:00:00.000Z');
    let time = start;
    const limiter = createLoginLimiter({ now: () => new Date(time) });
    expect(MAX_FAILED_LOGIN_ATTEMPTS).toBe(5);
    expect(LOGIN_LOCK_DURATION_MS).toBe(900000);
    expect(limiter.getRetryAfterSeconds(7)).toBeNull();
    for (let count = 0; count < 4; count++) limiter.registerAttempt(7);
    expect(limiter.getRetryAfterSeconds(7)).toBeNull();
    limiter.registerAttempt(7);
    expect(limiter.getRetryAfterSeconds(7)).toBe(900);
    expect(limiter.getRetryAfterSeconds(8)).toBeNull();
    time = start + 1;
    expect(limiter.getRetryAfterSeconds(7)).toBe(900);
    time = start + 899999;
    expect(limiter.getRetryAfterSeconds(7)).toBe(1);
    time = start + 900000;
    expect(limiter.getRetryAfterSeconds(7)).toBeNull();
    limiter.registerAttempt(7);
    expect(limiter.getRetryAfterSeconds(7)).toBe(900);
    limiter.registerSuccess(7);
    expect(limiter.getRetryAfterSeconds(7)).toBeNull();
    for (let count = 0; count < 4; count++) limiter.registerAttempt(7);
    expect(limiter.getRetryAfterSeconds(7)).toBeNull();
    limiter.registerAttempt(7);
    expect(limiter.getRetryAfterSeconds(7)).toBe(900);
    expect(() => limiter.registerSuccess(99)).not.toThrow();
    const custom = createLoginLimiter({
      now: () => new Date(time),
      maxFailedAttempts: 2,
      lockDurationMs: 1000,
    });
    custom.registerAttempt(7);
    custom.registerAttempt(7);
    expect(custom.getRetryAfterSeconds(7)).toBe(1);
  });
});
