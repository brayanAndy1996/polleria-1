import type { Server } from 'node:http';
import net from 'node:net';
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib';
import { errorResponseSchema } from '@polleria/shared';
import request from 'supertest';
import type { Sequelize } from 'sequelize';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { createApp } from '../src/app.ts';
import { closeTestDatabase } from './helpers/test-database.ts';
import { sendRawBody } from './helpers/raw-body.ts';
import { createUnreachableSequelize } from './helpers/unreachable-database.ts';

const UNSUPPORTED_MEDIA_TYPE_BODY = {
  error: {
    code: 'UNSUPPORTED_MEDIA_TYPE',
    message: 'La codificación del cuerpo de la solicitud no es compatible.',
    details: null,
  },
};

const INVALID_BODY_BODY = {
  error: {
    code: 'INVALID_BODY',
    message: 'No se pudo leer el cuerpo de la solicitud.',
    details: null,
  },
};

const NOT_FOUND_BODY = {
  error: { code: 'NOT_FOUND', message: 'La ruta solicitada no existe.', details: null },
};

const INVALID_JSON_BODY = {
  error: {
    code: 'INVALID_JSON',
    message: 'El cuerpo de la solicitud no es un JSON válido.',
    details: null,
  },
};

const PAYLOAD_TOO_LARGE_BODY = {
  error: {
    code: 'PAYLOAD_TOO_LARGE',
    message: 'La solicitud es demasiado grande.',
    details: null,
  },
};

const VALID_JSON = '{"a":1}';

/** JSON válido de exactamente `bytes` bytes: {"a":"xxx...x"}. */
function jsonBodyOfSize(bytes: number): string {
  const overhead = Buffer.byteLength('{"a":""}');
  return `{"a":"${'x'.repeat(bytes - overhead)}"}`;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

// Estas pruebas no tocan la base: usan un Sequelize que nunca se conecta.
describe('Errores del lector del cuerpo en createApp (sin base)', () => {
  let sequelize: Sequelize;
  let consoleError: MockInstance<typeof console.error>;

  beforeAll(() => {
    sequelize = createUnreachableSequelize();
  });

  beforeEach(() => {
    // Los errores inesperados se registran en console.error: aquí no debe llamarse nunca.
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  afterAll(async () => {
    await closeTestDatabase(sequelize);
  });

  describe('AC-33: codificación o charset no soportados', () => {
    it.each([
      [
        'Content-Encoding desconocido (bogus)',
        { 'Content-Type': 'application/json', 'Content-Encoding': 'bogus' },
      ],
      [
        'Content-Encoding registrado pero no soportado (compress)',
        { 'Content-Type': 'application/json', 'Content-Encoding': 'compress' },
      ],
      ['charset que no es UTF (latin1)', { 'Content-Type': 'application/json; charset=latin1' }],
      [
        'charset UTF que no existe (utf-99)',
        { 'Content-Type': 'application/json; charset=utf-99' },
      ],
    ])('AC-33: %s responde 415 UNSUPPORTED_MEDIA_TYPE sin traza', async (_caso, headers) => {
      const response = await request(createApp({ sequelize }))
        .post('/api/health')
        .set(headers)
        .send(VALID_JSON);

      expect(response.status).toBe(415);
      expect(response.headers['content-type']).toMatch(/^application\/json/);
      expect(response.body).toEqual(UNSUPPORTED_MEDIA_TYPE_BODY);
      expect(errorResponseSchema.safeParse(response.body as unknown).success).toBe(true);
      expect(consoleError).not.toHaveBeenCalled();
    });

    it('AC-33: la respuesta 415 no devuelve el valor recibido', async () => {
      const response = await request(createApp({ sequelize }))
        .post('/api/health')
        .set('Content-Type', 'application/json')
        .set('Content-Encoding', 'bogus')
        .send(VALID_JSON);

      expect(response.status).toBe(415);
      expect(response.text).not.toContain('bogus');
    });
  });

  describe('AC-34: cuerpo comprimido ilegible', () => {
    it.each([
      ['no es gzip', 'gzip', Buffer.from('esto no es gzip')],
      ['gzip truncado (12 bytes)', 'gzip', gzipSync(VALID_JSON).subarray(0, 12)],
      ['no es deflate', 'deflate', Buffer.from('esto no es deflate')],
      ['no es brotli', 'br', Buffer.from('esto no es brotli')],
    ])('AC-34: %s responde 400 INVALID_BODY sin traza', async (_caso, encoding, body) => {
      const response = await sendRawBody(
        request(createApp({ sequelize }))
          .post('/api/health')
          .set('Content-Type', 'application/json')
          .set('Content-Encoding', encoding),
        body,
      );

      expect(response.status).toBe(400);
      expect(response.headers['content-type']).toMatch(/^application\/json/);
      expect(response.body).toEqual(INVALID_BODY_BODY);
      expect(errorResponseSchema.safeParse(response.body as unknown).success).toBe(true);
      expect(consoleError).not.toHaveBeenCalled();
    });
  });

  describe('AC-36: los cuerpos comprimidos válidos siguen funcionando', () => {
    it.each([
      ['gzip', 'gzip', gzipSync(VALID_JSON)],
      ['deflate', 'deflate', deflateSync(VALID_JSON)],
      ['br', 'br', brotliCompressSync(VALID_JSON)],
      ['gzip con Content-Encoding en mayúsculas (GZIP)', 'GZIP', gzipSync(VALID_JSON)],
      ['sin comprimir con Content-Encoding identity', 'identity', Buffer.from(VALID_JSON)],
    ])(
      'AC-36: un cuerpo %s se lee bien y responde 404 NOT_FOUND',
      async (_caso, encoding, body) => {
        const response = await sendRawBody(
          request(createApp({ sequelize }))
            .post('/api/health')
            .set('Content-Type', 'application/json')
            .set('Content-Encoding', encoding),
          body,
        );

        expect(response.status).toBe(404);
        expect(response.body).toEqual(NOT_FOUND_BODY);
        expect(consoleError).not.toHaveBeenCalled();
      },
    );

    it('AC-36: un JSON mal formado comprimido con gzip responde 400 INVALID_JSON', async () => {
      const response = await sendRawBody(
        request(createApp({ sequelize }))
          .post('/api/health')
          .set('Content-Type', 'application/json')
          .set('Content-Encoding', 'gzip'),
        gzipSync('{"a":'),
      );

      expect(response.status).toBe(400);
      expect(response.body).toEqual(INVALID_JSON_BODY);
      expect(consoleError).not.toHaveBeenCalled();
    });

    it('AC-36: un JSON válido de 150 KB comprimido con gzip responde 413 PAYLOAD_TOO_LARGE (el límite se mide después de descomprimir)', async () => {
      const compressed = gzipSync(jsonBodyOfSize(150 * 1024));
      // El cuerpo comprimido es pequeño: el límite de 100 KB solo se supera al descomprimir.
      expect(compressed.length).toBeLessThan(100 * 1024);

      const response = await sendRawBody(
        request(createApp({ sequelize }))
          .post('/api/health')
          .set('Content-Type', 'application/json')
          .set('Content-Encoding', 'gzip'),
        compressed,
      );

      expect(response.status).toBe(413);
      expect(response.body).toEqual(PAYLOAD_TOO_LARGE_BODY);
      expect(consoleError).not.toHaveBeenCalled();
    });
  });

  describe('casos borde del lector del cuerpo (spec 001, 17.6)', () => {
    it('Borde: varias codificaciones (gzip, gzip) responden 415 UNSUPPORTED_MEDIA_TYPE', async () => {
      const response = await sendRawBody(
        request(createApp({ sequelize }))
          .post('/api/health')
          .set('Content-Type', 'application/json')
          .set('Content-Encoding', 'gzip, gzip'),
        gzipSync(gzipSync(VALID_JSON)),
      );

      expect(response.status).toBe(415);
      expect(response.body).toEqual(UNSUPPORTED_MEDIA_TYPE_BODY);
      expect(consoleError).not.toHaveBeenCalled();
    });

    it('Borde: un cuerpo vacío con Content-Encoding gzip y Content-Length 0 responde 400 INVALID_BODY', async () => {
      const response = await sendRawBody(
        request(createApp({ sequelize }))
          .post('/api/health')
          .set('Content-Type', 'application/json')
          .set('Content-Encoding', 'gzip')
          .set('Content-Length', '0'),
        Buffer.alloc(0),
      );

      expect(response.status).toBe(400);
      expect(response.body).toEqual(INVALID_BODY_BODY);
      expect(consoleError).not.toHaveBeenCalled();
    });

    it.each([
      ['text/plain', 'text/plain'],
      ['application/json; charset (mal formado)', 'application/json; charset'],
    ])(
      'Borde: un Content-Type %s no pasa por el lector y la ruta responde 404',
      async (_caso, contentType) => {
        const response = await request(createApp({ sequelize }))
          .post('/api/health')
          .set('Content-Type', contentType)
          .send(VALID_JSON);

        expect(response.status).toBe(404);
        expect(response.body).toEqual(NOT_FOUND_BODY);
        expect(consoleError).not.toHaveBeenCalled();
      },
    );

    it('Borde: charset=utf-16 con un cuerpo en UTF-8 existe pero se decodifica mal: responde 400 INVALID_JSON y no 415', async () => {
      const response = await sendRawBody(
        request(createApp({ sequelize }))
          .post('/api/health')
          .set('Content-Type', 'application/json; charset=utf-16'),
        Buffer.from(VALID_JSON, 'utf8'),
      );

      expect(response.status).toBe(400);
      expect(response.body).toEqual(INVALID_JSON_BODY);
      expect(consoleError).not.toHaveBeenCalled();
    });

    it('Borde: un GET con cuerpo y Content-Encoding desconocido también pasa por el lector y responde 415', async () => {
      const response = await request(createApp({ sequelize }))
        .get('/api/health')
        .set('Content-Type', 'application/json')
        .set('Content-Encoding', 'bogus')
        .send(VALID_JSON);

      expect(response.status).toBe(415);
      expect(response.body).toEqual(UNSUPPORTED_MEDIA_TYPE_BODY);
      expect(consoleError).not.toHaveBeenCalled();
    });
  });
});

describe('AC-35: solicitud cortada a mitad del cuerpo (servidor real, sin base)', () => {
  let sequelize: Sequelize;
  let server: Server;
  let port: number;
  let consoleError: MockInstance<typeof console.error>;

  /**
   * Abre una conexión TCP, anuncia un cuerpo de 100 bytes, envía solo `{"a":` y la destruye. Espera
   * a que el servidor haya recibido las cabeceras para que la prueba ejercite de verdad al lector.
   */
  function sendTruncatedRequest(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const received = new Promise<void>((resolveReceived) => {
        server.once('request', () => {
          resolveReceived();
        });
      });

      const socket = net.connect({ host: '127.0.0.1', port });
      socket.on('error', reject);
      socket.once('connect', () => {
        const head =
          'POST /api/health HTTP/1.1\r\n' +
          `Host: 127.0.0.1:${String(port)}\r\n` +
          'Content-Type: application/json\r\n' +
          'Content-Length: 100\r\n' +
          '\r\n';
        socket.write(`${head}{"a":`);
        void received.then(async () => {
          await sleep(50);
          socket.destroy();
          resolve();
        });
      });
    });
  }

  beforeAll(async () => {
    sequelize = createUnreachableSequelize();
    const app = createApp({ sequelize, healthTimeoutMs: 100 });

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        resolve();
      });
    });

    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('No se pudo obtener el puerto del servidor de prueba.');
    }
    port = address.port;
  });

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  afterAll(async () => {
    if (server !== undefined) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    }
    await closeTestDatabase(sequelize);
  });

  it('AC-35: no escribe nada en console.error durante los 500 ms siguientes y la API sigue atendiendo (GET /api/health responde 503)', async () => {
    await sendTruncatedRequest();
    await sleep(500);

    expect(consoleError).not.toHaveBeenCalled();

    const response = await request(`http://127.0.0.1:${String(port)}`).get('/api/health');
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ status: 'error', database: 'error' });
  });
});
