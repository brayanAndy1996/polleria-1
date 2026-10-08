import request from 'supertest';
import type { Express } from 'express';
import type { Sequelize } from 'sequelize';
import { vi } from 'vitest';
import type { UserRole } from '@polleria/shared';
import { createApp } from '../../src/app.ts';
import { defineModels } from '../../src/models/index.ts';
import { createBcryptPinHasher } from '../../src/services/auth/pin-hasher.ts';
import { createUserService } from '../../src/services/users/user.service.ts';

export const AUTH_START = new Date('2026-10-08T15:00:00.000Z');
export const SESSION_END = '2026-10-09T07:00:00.000Z';
export const INVALID_CREDENTIALS_BODY = {
  error: { code: 'INVALID_CREDENTIALS', message: 'Usuario o PIN incorrecto.', details: null },
};
export const UNAUTHENTICATED_BODY = {
  error: {
    code: 'UNAUTHENTICATED',
    message: 'Debes iniciar sesión para continuar.',
    details: null,
  },
};

export function setupAuth(sequelize: Sequelize, cost = 4) {
  let time = AUTH_START.getTime();
  const now = () => new Date(time);
  const realHasher = createBcryptPinHasher({ cost });
  const verify = vi.fn((pin: string, hash: string) => realHasher.verify(pin, hash));
  const pinHasher = { hash: (pin: string) => realHasher.hash(pin), verify };
  const models = defineModels(sequelize);
  const userService = createUserService({ models, pinHasher });
  const app = createApp({ sequelize, now, pinHasher });
  return {
    app,
    now,
    models,
    pinHasher,
    verify,
    setTime: (milliseconds: number) => {
      time = AUTH_START.getTime() + milliseconds;
    },
    createUser: (
      username = 'mozo.juan',
      displayName = 'Juan',
      roles: UserRole[] = ['waiter'],
      pin = '2468',
    ) => userService.createUser({ username, displayName, roles, pin }),
  };
}

export async function loginWithCookie(app: Express, username = 'mozo.juan', pin = '2468') {
  const response = await request(app).post('/api/auth/login').send({ username, pin });
  const headers: unknown = response.headers['set-cookie'];
  const first: unknown = Array.isArray(headers) ? headers[0] : headers;
  const value = typeof first === 'string' ? first : '';
  return {
    response,
    cookie: value.split(';')[0] ?? '',
    token: value.split(';')[0]?.split('=')[1] ?? '',
  };
}
