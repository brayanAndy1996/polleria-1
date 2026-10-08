import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { describe, expect, it } from 'vitest';
import { CONFIG_VARIABLES, loadConfig } from './env.ts';

const ENV_EXAMPLE_PATH = path.resolve(import.meta.dirname, '../../.env.example');

function readEnvExample(): Record<string, string> {
  return parseEnv(readFileSync(ENV_EXAMPLE_PATH, 'utf8')) as Record<string, string>;
}

describe('apps/api/.env.example', () => {
  it('AC-07: loadConfig acepta las variables del archivo sin lanzar error', () => {
    expect(() => loadConfig(readEnvExample())).not.toThrow();
  });

  it('AC-07: las variables del archivo son exactamente CONFIG_VARIABLES', () => {
    const variables = Object.keys(readEnvExample()).sort();

    expect([...CONFIG_VARIABLES].sort()).toEqual([
      'DATABASE_URL',
      'DATABASE_URL_TEST',
      'HOST',
      'NODE_ENV',
      'PORT',
      'PRINTER_DRIVER',
      'PRINTER_FILE_DIR',
    ]);
    expect(variables).toEqual([...CONFIG_VARIABLES].sort());
  });

  it('AC-07: DATABASE_URL y DATABASE_URL_TEST usan la clave de ejemplo cambia_esta_clave', () => {
    const env = readEnvExample();

    for (const name of ['DATABASE_URL', 'DATABASE_URL_TEST'] as const) {
      const value = env[name];
      expect(value, `${name} debe estar definida en .env.example`).toBeDefined();
      expect(new URL(value as string).password).toBe('cambia_esta_clave');
    }
  });

  it('AC-07: DATABASE_URL apunta a polleria_dev y DATABASE_URL_TEST a polleria_test', () => {
    const env = readEnvExample();

    expect(env.DATABASE_URL?.endsWith('/polleria_dev')).toBe(true);
    expect(env.DATABASE_URL_TEST?.endsWith('/polleria_test')).toBe(true);
  });
});
