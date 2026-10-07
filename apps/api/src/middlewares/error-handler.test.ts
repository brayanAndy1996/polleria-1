import { ERROR_CODES, errorResponseSchema } from '@polleria/shared';
import express from 'express';
import type { Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AppError } from '../errors/app-error.ts';
import { errorHandler, notFoundHandler } from './error-handler.ts';

const INTERNAL_ERROR_BODY = {
  error: {
    code: 'INTERNAL_ERROR',
    message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    details: null,
  },
};

/** App de prueba: monta las rutas que lanzan cada tipo de error y después el errorHandler. */
function buildTestApp(): Express {
  const app = express();

  app.get('/app-error-sync', () => {
    throw new AppError({
      code: 'TEST_CONFLICT',
      message: 'Conflicto de prueba.',
      httpStatus: 409,
      details: { field: 'x' },
    });
  });

  app.get('/app-error-async', async () => {
    await Promise.resolve();
    throw new AppError({
      code: 'TEST_CONFLICT',
      message: 'Conflicto de prueba.',
      httpStatus: 409,
      details: { field: 'x' },
    });
  });

  app.get('/app-error-without-details', () => {
    throw new AppError({
      code: 'TEST_CONFLICT',
      message: 'Conflicto de prueba.',
      httpStatus: 409,
    });
  });

  app.get('/zod-simple', () => {
    z.object({ name: z.string().min(1) }).parse({ name: '' });
  });

  app.get('/zod-nested', () => {
    z.object({
      items: z.array(z.object({ quantity: z.number().int().min(1) })),
    }).parse({ items: [{ quantity: 0 }] });
  });

  app.get('/zod-async', async () => {
    await Promise.resolve();
    z.object({ name: z.string().min(1) }).parse({ name: '' });
  });

  app.get('/unexpected-error', () => {
    throw new Error('detalle interno secreto');
  });

  app.get('/unexpected-error-async', async () => {
    await Promise.resolve();
    throw new Error('detalle interno secreto');
  });

  app.get('/unexpected-string', () => {
    const thrown: unknown = 'falla';
    throw thrown;
  });

  app.use(errorHandler);
  return app;
}

describe('errorHandler con una app de prueba', () => {
  beforeEach(() => {
    // Los errores inesperados se registran con su traza: se silencia para no ensuciar la salida.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('AppError', () => {
    it.each([
      ['síncrona', '/app-error-sync'],
      ['async con la promesa rechazada', '/app-error-async'],
    ])(
      'AC-18: una ruta %s responde con el código y el estado HTTP del AppError',
      async (_tipo, path) => {
        const response = await request(buildTestApp()).get(path);

        expect(response.status).toBe(409);
        expect(response.body).toEqual({
          error: {
            code: 'TEST_CONFLICT',
            message: 'Conflicto de prueba.',
            details: { field: 'x' },
          },
        });
        expect(errorResponseSchema.safeParse(response.body as unknown).success).toBe(true);
        expect(response.headers['content-type']).toMatch(/^application\/json/);
      },
    );

    it('AC-18: un AppError sin details responde details null', async () => {
      const response = await request(buildTestApp()).get('/app-error-without-details');

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        error: { code: 'TEST_CONFLICT', message: 'Conflicto de prueba.', details: null },
      });
    });

    it('AC-18: AppError es un Error con code, httpStatus y details', () => {
      const error = new AppError({
        code: 'TEST_CONFLICT',
        message: 'Conflicto de prueba.',
        httpStatus: 409,
        details: { field: 'x' },
      });
      const withoutDetails = new AppError({
        code: 'TEST_CONFLICT',
        message: 'Conflicto de prueba.',
        httpStatus: 409,
      });

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Conflicto de prueba.');
      expect(error.code).toBe('TEST_CONFLICT');
      expect(error.httpStatus).toBe(409);
      expect(error.details).toEqual({ field: 'x' });
      expect(withoutDetails.details).toBeNull();
    });
  });

  describe('ZodError', () => {
    it.each([
      ['síncrona', '/zod-simple'],
      ['async', '/zod-async'],
    ])(
      'AC-19: una ruta %s con un campo inválido responde 400 VALIDATION_ERROR',
      async (_tipo, path) => {
        const response = await request(buildTestApp()).get(path);

        expect(response.status).toBe(400);
        expect(errorResponseSchema.safeParse(response.body as unknown).success).toBe(true);

        const body = response.body as {
          error: { code: string; message: string; details: { issues: unknown[] } };
        };
        expect(body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
        expect(body.error.message).toBe('Los datos enviados no son válidos.');
        expect(body.error.details.issues).toEqual([
          { path: 'name', message: expect.stringMatching(/\S/) as unknown },
        ]);
      },
    );

    it('AC-19: un error en un campo anidado usa el path items.0.quantity', async () => {
      const response = await request(buildTestApp()).get('/zod-nested');

      expect(response.status).toBe(400);
      const body = response.body as {
        error: { code: string; details: { issues: { path: string; message: string }[] } };
      };
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details.issues).toHaveLength(1);
      expect(body.error.details.issues[0]?.path).toBe('items.0.quantity');
      expect(body.error.details.issues[0]?.message.length).toBeGreaterThan(0);
    });
  });

  describe('errores inesperados', () => {
    it.each([
      ['un Error síncrono', '/unexpected-error'],
      ['un Error en una ruta async', '/unexpected-error-async'],
      ['un valor que no es Error (la cadena "falla")', '/unexpected-string'],
    ])('AC-20: %s responde 500 INTERNAL_ERROR sin filtrar detalles', async (_tipo, path) => {
      const response = await request(buildTestApp()).get(path);

      expect(response.status).toBe(500);
      expect(response.body).toEqual(INTERNAL_ERROR_BODY);
      expect(errorResponseSchema.safeParse(response.body as unknown).success).toBe(true);
      expect(response.text).not.toContain('detalle interno secreto');
      expect(response.text).not.toMatch(/\bat\s+\S+\s+\(|\.ts:\d+|stack/i);
    });

    it('AC-20: el error inesperado no deja que el servidor se caiga: la siguiente solicitud responde', async () => {
      const app = buildTestApp();

      const first = await request(app).get('/unexpected-error');
      const second = await request(app).get('/app-error-sync');

      expect(first.status).toBe(500);
      expect(second.status).toBe(409);
    });
  });
});

describe('notFoundHandler con una app de prueba', () => {
  it('AC-16: responde 404 NOT_FOUND con el formato común para cualquier ruta no montada', async () => {
    const app = express();
    app.use(notFoundHandler);
    app.use(errorHandler);

    const response = await request(app).get('/ruta-que-no-existe');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'La ruta solicitada no existe.', details: null },
    });
  });
});
