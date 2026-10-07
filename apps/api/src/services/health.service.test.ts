import type { Sequelize } from 'sequelize';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_HEALTH_TIMEOUT_MS, createHealthService } from './health.service.ts';

const FIXED_NOW = new Date('2026-10-07T20:00:00.000Z');
const FIXED_TIMESTAMP = '2026-10-07T20:00:00.000Z';

const OK_RESULT = { status: 'ok', database: 'ok', timestamp: FIXED_TIMESTAMP };
const ERROR_RESULT = { status: 'error', database: 'error', timestamp: FIXED_TIMESTAMP };

type FakeSequelize = Pick<Sequelize, 'authenticate'>;

function fakeSequelize(authenticate: FakeSequelize['authenticate']): FakeSequelize {
  return { authenticate };
}

describe('createHealthService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('AC-14: devuelve ok cuando authenticate() se resuelve', async () => {
    const service = createHealthService({
      sequelize: fakeSequelize(() => Promise.resolve()),
      timeoutMs: 50,
      now: () => FIXED_NOW,
    });

    await expect(service.check()).resolves.toStrictEqual(OK_RESULT);
  });

  it('AC-14: devuelve error cuando authenticate() se rechaza', async () => {
    const service = createHealthService({
      sequelize: fakeSequelize(() => Promise.reject(new Error('ECONNREFUSED 127.0.0.1:1'))),
      timeoutMs: 50,
      now: () => FIXED_NOW,
    });

    await expect(service.check()).resolves.toStrictEqual(ERROR_RESULT);
  });

  it('AC-14: devuelve error en menos de 1 s cuando authenticate() nunca se resuelve (timeoutMs 50)', async () => {
    const service = createHealthService({
      // Nunca se resuelve ni se rechaza: simula una base colgada.
      sequelize: fakeSequelize(() => new Promise<void>(() => undefined)),
      timeoutMs: 50,
      now: () => FIXED_NOW,
    });

    const startedAt = performance.now();
    const result = await service.check();
    const elapsedMs = performance.now() - startedAt;

    expect(result).toStrictEqual(ERROR_RESULT);
    expect(elapsedMs).toBeLessThan(1000);
  });

  it('AC-14: check() no lanza aunque authenticate() lance de forma síncrona', async () => {
    const service = createHealthService({
      sequelize: fakeSequelize(() => {
        throw new Error('fallo síncrono');
      }),
      timeoutMs: 50,
      now: () => FIXED_NOW,
    });

    await expect(service.check()).resolves.toStrictEqual(ERROR_RESULT);
  });

  it('AC-14: check() no lanza aunque authenticate() se rechace con un valor que no es Error', async () => {
    const rejection: unknown = 'texto suelto';
    const service = createHealthService({
      // Rechazar con un valor que no es Error es justo lo que prueba este caso.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      sequelize: fakeSequelize(() => Promise.reject(rejection)),
      timeoutMs: 50,
      now: () => FIXED_NOW,
    });

    await expect(service.check()).resolves.toStrictEqual(ERROR_RESULT);
  });

  it('AC-14: la respuesta de error no incluye mensajes del driver ni otras claves', async () => {
    const service = createHealthService({
      sequelize: fakeSequelize(() =>
        Promise.reject(new Error('password authentication failed for user "polleria"')),
      ),
      timeoutMs: 50,
      now: () => FIXED_NOW,
    });

    const result = await service.check();

    expect(Object.keys(result).sort()).toEqual(['database', 'status', 'timestamp']);
    expect(JSON.stringify(result)).not.toContain('polleria');
    expect(JSON.stringify(result)).not.toContain('password');
  });

  it('AC-14: el timestamp sale de now() en cada consulta', async () => {
    const times = [new Date('2026-10-07T20:00:00.000Z'), new Date('2026-10-07T20:00:10.500Z')];
    let call = 0;
    const service = createHealthService({
      sequelize: fakeSequelize(() => Promise.resolve()),
      timeoutMs: 50,
      now: () => times[call++] ?? FIXED_NOW,
    });

    const first = await service.check();
    const second = await service.check();

    expect(first.timestamp).toBe('2026-10-07T20:00:00.000Z');
    expect(second.timestamp).toBe('2026-10-07T20:00:10.500Z');
  });

  it('AC-14: DEFAULT_HEALTH_TIMEOUT_MS vale 2000', () => {
    expect(DEFAULT_HEALTH_TIMEOUT_MS).toBe(2000);
  });

  it('AC-14: sin timeoutMs usa el límite por defecto de unos 2 s', async () => {
    vi.useFakeTimers();
    const service = createHealthService({
      sequelize: fakeSequelize(() => new Promise<void>(() => undefined)),
      now: () => FIXED_NOW,
    });

    let settled = false;
    const pending = service.check().then((result: unknown) => {
      settled = true;
      return result;
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1100);
    expect(settled).toBe(true);
    await expect(pending).resolves.toStrictEqual(ERROR_RESULT);
  });
});
