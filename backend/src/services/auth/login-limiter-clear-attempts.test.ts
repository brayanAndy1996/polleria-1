import { describe, expect, it } from 'vitest';
import { createLoginLimiter } from './login-limiter.ts';

describe('004: limpiar el conteo de intentos', () => {
  it('AC-07: clearAttempts borra el bloqueo, reinicia el conteo y no afecta a otros', () => {
    const start = Date.parse('2026-10-08T15:00:00.000Z');
    const limiter = createLoginLimiter({ now: () => new Date(start) });
    // El usuario 8 se bloquea primero: clearAttempts(7) no debe tocarlo.
    for (let count = 0; count < 5; count++) limiter.registerAttempt(8);
    expect(limiter.getRetryAfterSeconds(8)).toBe(900);
    for (let count = 0; count < 5; count++) limiter.registerAttempt(7);
    expect(limiter.getRetryAfterSeconds(7)).toBe(900);
    limiter.clearAttempts(7);
    expect(limiter.getRetryAfterSeconds(7)).toBeNull();
    // El conteo del usuario 7 empezó de cero: cuatro fallos no bloquean y el quinto sí.
    for (let count = 0; count < 4; count++) limiter.registerAttempt(7);
    expect(limiter.getRetryAfterSeconds(7)).toBeNull();
    limiter.registerAttempt(7);
    expect(limiter.getRetryAfterSeconds(7)).toBe(900);
    // El usuario 8 siguió bloqueado todo el tiempo.
    expect(limiter.getRetryAfterSeconds(8)).toBe(900);
    // Limpiar a alguien sin intentos no lanza.
    expect(() => limiter.clearAttempts(9)).not.toThrow();
    expect(limiter.getRetryAfterSeconds(9)).toBeNull();
  });
});
