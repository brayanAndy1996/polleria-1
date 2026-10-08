import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CONFIG_VARIABLES,
  ConfigError,
  DEFAULT_PRINTER_FILE_DIR,
  PROJECT_ROOT_DIR,
  loadConfig,
} from './env.ts';

const DEV_URL = 'postgres://polleria:clave@localhost:5432/polleria_dev';

/** Raíz del monorepo según la ubicación de este archivo (apps/api/src/config/). */
const EXPECTED_ROOT = path.resolve(import.meta.dirname, '../../../..');

const ENV_EXAMPLE_PATH = path.resolve(import.meta.dirname, '../../.env.example');

type Env = Record<string, string | undefined>;

/** Ejecuta loadConfig y devuelve el ConfigError lanzado (falla si no lanza o si lanza otra cosa). */
function getConfigError(env: Env): ConfigError {
  let thrown: unknown;
  try {
    loadConfig(env);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(ConfigError);
  return thrown as ConfigError;
}

/** Texto completo que podría filtrar un valor recibido: el mensaje y los issues serializados. */
function visibleText(error: ConfigError): string {
  return `${error.message}\n${JSON.stringify(error.issues)}`;
}

describe('002: configuración de impresión (apps/api/src/config/env.ts)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe('AC-02: valores por defecto', () => {
    it('AC-02: con solo DATABASE_URL devuelve la configuración completa con la impresión por defecto', () => {
      const config = loadConfig({ DATABASE_URL: DEV_URL });

      expect(config).toStrictEqual({
        nodeEnv: 'development',
        host: '127.0.0.1',
        port: 4000,
        databaseUrl: DEV_URL,
        databaseUrlTest: undefined,
        printer: { driver: 'file', fileDir: DEFAULT_PRINTER_FILE_DIR },
      });
    });

    it('AC-02: PROJECT_ROOT_DIR es la raíz del monorepo y tiene pnpm-workspace.yaml', () => {
      expect(path.isAbsolute(PROJECT_ROOT_DIR)).toBe(true);
      expect(PROJECT_ROOT_DIR).toBe(EXPECTED_ROOT);
      expect(existsSync(path.join(PROJECT_ROOT_DIR, 'pnpm-workspace.yaml'))).toBe(true);
    });

    it('AC-02: DEFAULT_PRINTER_FILE_DIR es tmp/comandas dentro de la raíz del monorepo', () => {
      expect(DEFAULT_PRINTER_FILE_DIR).toBe(path.join(PROJECT_ROOT_DIR, 'tmp', 'comandas'));
      expect(DEFAULT_PRINTER_FILE_DIR).toBe(path.join(EXPECTED_ROOT, 'tmp', 'comandas'));
    });

    it('AC-02: no depende de process.cwd() al cargar la configuración', () => {
      vi.spyOn(process, 'cwd').mockReturnValue(os.tmpdir());
      expect(process.cwd()).toBe(os.tmpdir());

      expect(loadConfig({ DATABASE_URL: DEV_URL }).printer.fileDir).toBe(DEFAULT_PRINTER_FILE_DIR);
      expect(
        loadConfig({ DATABASE_URL: DEV_URL, PRINTER_FILE_DIR: 'tmp/otra' }).printer.fileDir,
      ).toBe(path.join(PROJECT_ROOT_DIR, 'tmp', 'otra'));
    });

    it('AC-02: PROJECT_ROOT_DIR tampoco depende de process.cwd() al importar el módulo', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(os.tmpdir());
      vi.resetModules();

      const fresh = await import('./env.ts');

      expect(fresh.PROJECT_ROOT_DIR).toBe(EXPECTED_ROOT);
      expect(fresh.DEFAULT_PRINTER_FILE_DIR).toBe(path.join(EXPECTED_ROOT, 'tmp', 'comandas'));
    });
  });

  describe('AC-03: PRINTER_FILE_DIR relativa, absoluta o vacía', () => {
    it.each(['tmp/otra', 'tmp/otra/'])(
      'AC-03: PRINTER_FILE_DIR=%j se toma desde la raíz del monorepo, sin separador final',
      (value) => {
        const config = loadConfig({ DATABASE_URL: DEV_URL, PRINTER_FILE_DIR: value });

        expect(config.printer.fileDir).toBe(path.resolve(PROJECT_ROOT_DIR, 'tmp/otra'));
      },
    );

    it('AC-03: una ruta relativa que sale del proyecto (..) se permite', () => {
      const config = loadConfig({ DATABASE_URL: DEV_URL, PRINTER_FILE_DIR: '../comandas-fuera' });

      expect(config.printer.fileDir).toBe(path.resolve(PROJECT_ROOT_DIR, '../comandas-fuera'));
    });

    it('AC-03: una ruta absoluta que no existe se acepta tal cual y loadConfig no la crea', () => {
      const missing = path.join(os.tmpdir(), `polleria-no-existe-${randomUUID()}`);

      const config = loadConfig({ DATABASE_URL: DEV_URL, PRINTER_FILE_DIR: missing });

      expect(config.printer.fileDir).toBe(path.resolve(missing));
      expect(existsSync(missing)).toBe(false);
    });

    it('Borde: una ruta sin unidad (/comandas) se resuelve contra la unidad de la raíz del proyecto', () => {
      const config = loadConfig({ DATABASE_URL: DEV_URL, PRINTER_FILE_DIR: '/comandas' });

      expect(config.printer.fileDir).toBe(path.resolve(PROJECT_ROOT_DIR, '/comandas'));
    });

    it.each(['', '   '])(
      'AC-03: PRINTER_FILE_DIR=%j lanza el issue "no puede estar vacía."',
      (value) => {
        const error = getConfigError({ DATABASE_URL: DEV_URL, PRINTER_FILE_DIR: value });

        expect(error.issues).toEqual([
          { variable: 'PRINTER_FILE_DIR', message: 'no puede estar vacía.' },
        ]);
      },
    );
  });

  describe('AC-04: PRINTER_DRIVER', () => {
    it('AC-04: PRINTER_DRIVER=file devuelve el driver file', () => {
      const config = loadConfig({ DATABASE_URL: DEV_URL, PRINTER_DRIVER: 'file' });

      expect(config.printer.driver).toBe('file');
    });

    it.each(['development', 'test', 'production'])(
      'AC-04: PRINTER_DRIVER=file se acepta con NODE_ENV=%s',
      (nodeEnv) => {
        const url =
          nodeEnv === 'test' ? 'postgres://polleria:clave@localhost:5432/polleria_test' : DEV_URL;

        expect(
          loadConfig({ DATABASE_URL: url, NODE_ENV: nodeEnv, PRINTER_DRIVER: 'file' }).printer
            .driver,
        ).toBe('file');
      },
    );

    it('AC-04: PRINTER_DRIVER=escpos se rechaza porque todavía no está disponible', () => {
      const error = getConfigError({ DATABASE_URL: DEV_URL, PRINTER_DRIVER: 'escpos' });

      expect(error.issues).toEqual([
        {
          variable: 'PRINTER_DRIVER',
          message: 'escpos todavía no está disponible en esta versión; usa file.',
        },
      ]);
      expect(error.message).toContain(
        '- PRINTER_DRIVER: escpos todavía no está disponible en esta versión; usa file.',
      );
    });

    it.each(['laser', 'FILE', 'File', ' file', ''])(
      'AC-04: PRINTER_DRIVER=%j se rechaza con "debe ser file o escpos."',
      (value) => {
        const error = getConfigError({ DATABASE_URL: DEV_URL, PRINTER_DRIVER: value });

        expect(error.issues).toEqual([
          { variable: 'PRINTER_DRIVER', message: 'debe ser file o escpos.' },
        ]);
      },
    );

    it('AC-04: el mensaje y los issues no repiten el valor recibido (laser)', () => {
      const error = getConfigError({ DATABASE_URL: DEV_URL, PRINTER_DRIVER: 'laser' });

      expect(error.message).not.toContain('laser');
      expect(JSON.stringify(error.issues)).not.toContain('laser');
      expect(visibleText(error)).not.toContain('laser');
    });

    it('AC-04: informa a la vez los problemas de DATABASE_URL, PORT, PRINTER_DRIVER y PRINTER_FILE_DIR', () => {
      const error = getConfigError({ PORT: 'abc', PRINTER_DRIVER: 'laser', PRINTER_FILE_DIR: '' });

      expect(error.issues.map((issue) => issue.variable).sort()).toEqual([
        'DATABASE_URL',
        'PORT',
        'PRINTER_DRIVER',
        'PRINTER_FILE_DIR',
      ]);

      const lines = error.message.split(/\r?\n/);
      expect(error.message.startsWith('Configuración inválida.')).toBe(true);
      for (const issue of error.issues) {
        expect(lines).toContain(`- ${issue.variable}: ${issue.message}`);
      }
      expect(error.issues).toContainEqual({
        variable: 'PRINTER_DRIVER',
        message: 'debe ser file o escpos.',
      });
      expect(error.issues).toContainEqual({
        variable: 'PRINTER_FILE_DIR',
        message: 'no puede estar vacía.',
      });
    });
  });

  describe('AC-05: apps/api/.env.example documenta la impresión', () => {
    function readEnvExample(): Record<string, string> {
      return parseEnv(readFileSync(ENV_EXAMPLE_PATH, 'utf8')) as Record<string, string>;
    }

    it('AC-05: CONFIG_VARIABLES y las variables del archivo son exactamente las siete', () => {
      const expected = [
        'DATABASE_URL',
        'DATABASE_URL_TEST',
        'HOST',
        'NODE_ENV',
        'PORT',
        'PRINTER_DRIVER',
        'PRINTER_FILE_DIR',
      ];

      expect([...CONFIG_VARIABLES].sort()).toEqual(expected);
      expect(Object.keys(readEnvExample()).sort()).toEqual(expected);
    });

    it('AC-05: el archivo trae PRINTER_DRIVER=file y PRINTER_FILE_DIR=tmp/comandas', () => {
      const env = readEnvExample();

      expect(env.PRINTER_DRIVER).toBe('file');
      expect(env.PRINTER_FILE_DIR).toBe('tmp/comandas');
    });

    it('AC-05: loadConfig con las variables del archivo devuelve el driver file y la carpeta por defecto', () => {
      expect(loadConfig(readEnvExample()).printer).toStrictEqual({
        driver: 'file',
        fileDir: DEFAULT_PRINTER_FILE_DIR,
      });
    });
  });
});
