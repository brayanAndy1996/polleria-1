export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOGIN_LOCK_DURATION_MS = 900000;
export interface LoginLimiter {
  getRetryAfterSeconds(userId: number): number | null;
  registerAttempt(userId: number): void;
  registerSuccess(userId: number): void;
  clearAttempts(userId: number): void;
}
export function createLoginLimiter(options: {
  now: () => Date;
  maxFailedAttempts?: number;
  lockDurationMs?: number;
}): LoginLimiter {
  const maxFailedAttempts = options.maxFailedAttempts ?? MAX_FAILED_LOGIN_ATTEMPTS;
  const lockDurationMs = options.lockDurationMs ?? LOGIN_LOCK_DURATION_MS;
  const attempts = new Map<number, { count: number; lockedUntil: number }>();
  return {
    getRetryAfterSeconds(userId) {
      const entry = attempts.get(userId);
      const remaining = (entry?.lockedUntil ?? 0) - options.now().getTime();
      return remaining > 0 ? Math.ceil(remaining / 1000) : null;
    },
    registerAttempt(userId) {
      const entry = attempts.get(userId) ?? { count: 0, lockedUntil: 0 };
      entry.count += 1;
      if (entry.count >= maxFailedAttempts)
        entry.lockedUntil = options.now().getTime() + lockDurationMs;
      attempts.set(userId, entry);
    },
    registerSuccess(userId) {
      attempts.delete(userId);
    },
    clearAttempts(userId) {
      attempts.delete(userId);
    },
  };
}
