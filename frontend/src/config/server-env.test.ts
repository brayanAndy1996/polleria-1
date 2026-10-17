import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WEB_CONFIG_VARIABLES, loadWebServerConfig } from './server-env.ts';

const ENV_EXAMPLE_PATH = path.resolve(import.meta.dirname, '../../.env.example');

const ERROR_PREFIX = 'Configuración inválida de la web.';

function getError(env: Record<string, string | undefined>): Error {
  let thrown: unknown;
  try {
    loadWebServerConfig(env);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(Error);
  return thrown as Error;
}

describe('loadWebServerConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('AC-28: sin variables devuelve la dirección interna por defecto y ningún origen permitido', () => {
    expect(loadWebServerConfig({})).toStrictEqual({
      apiInternalUrl: 'http://127.0.0.1:4000',
      allowedDevOrigins: [],
    });
  });

  it('AC-28: quita la barra final de API_INTERNAL_URL', () => {
    const config = loadWebServerConfig({ API_INTERNAL_URL: 'http://192.168.1.50:4000/' });

    expect(config.apiInternalUrl).toBe('http://192.168.1.50:4000');
  });

  it('AC-28: conserva API_INTERNAL_URL cuando no trae barra final', () => {
    const config = loadWebServerConfig({ API_INTERNAL_URL: 'http://192.168.1.50:4000' });

    expect(config.apiInternalUrl).toBe('http://192.168.1.50:4000');
  });

  it('AC-28: separa WEB_ALLOWED_DEV_ORIGINS por comas, recorta espacios y descarta los vacíos', () => {
    const config = loadWebServerConfig({
      WEB_ALLOWED_DEV_ORIGINS: ' 192.168.1.20, ,192.168.1.21 ',
    });

    expect(config.allowedDevOrigins).toEqual(['192.168.1.20', '192.168.1.21']);
  });

  it.each([
    ['vacía', ''],
    ['solo espacios y comas', ' , ,'],
  ])('AC-28: WEB_ALLOWED_DEV_ORIGINS %s devuelve una lista vacía', (_nombre, value) => {
    expect(loadWebServerConfig({ WEB_ALLOWED_DEV_ORIGINS: value }).allowedDevOrigins).toEqual([]);
  });

  it.each([
    ['ftp://192.168.1.50', 'un protocolo que no es http'],
    ['no-es-url', 'un texto que no es URL'],
  ])('AC-28: API_INTERNAL_URL=%s (%s) lanza un Error que nombra la variable', (value) => {
    const error = getError({ API_INTERNAL_URL: value });

    expect(error.message.startsWith(ERROR_PREFIX)).toBe(true);
    expect(error.message).toContain('API_INTERNAL_URL');
  });

  it('AC-28: no lee process.env: solo usa el objeto que recibe', () => {
    vi.stubEnv('API_INTERNAL_URL', 'http://10.0.0.9:9999');
    vi.stubEnv('WEB_ALLOWED_DEV_ORIGINS', '10.0.0.9');

    expect(loadWebServerConfig({})).toStrictEqual({
      apiInternalUrl: 'http://127.0.0.1:4000',
      allowedDevOrigins: [],
    });
  });
});

// Enmienda 1 (D-14): apiInternalUrl es siempre el origen de la URL.
describe('loadWebServerConfig: API_INTERNAL_URL se reduce a su origen', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each([
    ['http://127.0.0.1:4000/base', 'http://127.0.0.1:4000'],
    ['http://127.0.0.1:4000/?x=1', 'http://127.0.0.1:4000'],
    ['http://127.0.0.1:4000/#frag', 'http://127.0.0.1:4000'],
    ['http://127.0.0.1:4000/api/', 'http://127.0.0.1:4000'],
    ['http://192.168.1.50:4000/', 'http://192.168.1.50:4000'],
    ['HTTP://Servidor-Local:4000/x', 'http://servidor-local:4000'],
    ['http://127.0.0.1:80/', 'http://127.0.0.1'],
    ['https://api.local:443/x?y=1#z', 'https://api.local'],
    ['http://[::1]:4000/x', 'http://[::1]:4000'],
  ])('AC-45: API_INTERNAL_URL=%s da apiInternalUrl %s', (value, expected) => {
    expect(() => loadWebServerConfig({ API_INTERNAL_URL: value })).not.toThrow();
    expect(loadWebServerConfig({ API_INTERNAL_URL: value }).apiInternalUrl).toBe(expected);
  });

  it('AC-45: el rewrite de next.config.ts con API_INTERNAL_URL=http://127.0.0.1:4000/base apunta a http://127.0.0.1:4000/api/:path*', async () => {
    vi.stubEnv('API_INTERNAL_URL', 'http://127.0.0.1:4000/base');
    vi.resetModules();

    const { default: nextConfig } = await import('../../next.config.ts');
    const rewrites = await nextConfig.rewrites?.();

    expect(rewrites).toEqual([
      { source: '/api/:path*', destination: 'http://127.0.0.1:4000/api/:path*' },
    ]);
  });

  it.each([
    ['ftp://192.168.1.50', 'un protocolo que no es http'],
    ['no-es-url', 'un texto que no es URL'],
  ])('AC-45: API_INTERNAL_URL=%s (%s) sigue lanzando el mismo error de AC-28', (value) => {
    const error = getError({ API_INTERNAL_URL: value });

    expect(error.message).toBe(
      `${ERROR_PREFIX}\n- API_INTERNAL_URL: debe ser una URL http o https (por ejemplo http://127.0.0.1:4000).`,
    );
  });
});

describe('loadWebServerConfig: API_INTERNAL_URL con usuario o clave', () => {
  it.each([
    ['usuario y clave', 'http://admin:Secreta_123@127.0.0.1:4000'],
    ['solo usuario', 'http://admin@127.0.0.1:4000'],
  ])('AC-46: API_INTERNAL_URL con %s se rechaza sin mostrar el valor', (_caso, value) => {
    const error = getError({ API_INTERNAL_URL: value });

    expect(error.message.startsWith(ERROR_PREFIX)).toBe(true);
    expect(error.message.split('\n')).toContain(
      '- API_INTERNAL_URL: no debe incluir usuario ni clave.',
    );
    expect(error.message).not.toContain('Secreta_123');
    expect(error.message).not.toContain('admin');
  });
});

describe('frontend/.env.example', () => {
  function readEnvExample(): Record<string, string> {
    return parseEnv(readFileSync(ENV_EXAMPLE_PATH, 'utf8')) as Record<string, string>;
  }

  it('AC-28: contiene exactamente las variables de WEB_CONFIG_VARIABLES', () => {
    expect([...WEB_CONFIG_VARIABLES].sort()).toEqual([
      'API_INTERNAL_URL',
      'WEB_ALLOWED_DEV_ORIGINS',
    ]);
    expect(Object.keys(readEnvExample()).sort()).toEqual([...WEB_CONFIG_VARIABLES].sort());
  });

  it('AC-28: sus valores pasan la validación', () => {
    expect(() => loadWebServerConfig(readEnvExample())).not.toThrow();
    expect(loadWebServerConfig(readEnvExample())).toStrictEqual({
      apiInternalUrl: 'http://127.0.0.1:4000',
      allowedDevOrigins: [],
    });
  });
});
