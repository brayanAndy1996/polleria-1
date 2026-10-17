/**
 * Ataques a la configuración de impresión y al comando `pnpm printer:test` (adversarial-tester,
 * spec 002).
 *
 * No usan la base de datos: el comando nunca se conecta y la DATABASE_URL de las pruebas apunta a
 * un puerto sin servidor. Cada prueba usa su propia carpeta bajo os.tmpdir() (R-002-05).
 */
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROJECT_ROOT_DIR, loadConfig } from '../../src/config/env.ts';
import {
  buildChildEnv,
  killAllChildProcesses,
  runPrintTestPage,
} from '../helpers/child-process.ts';
import type { EnvOverrides } from '../helpers/child-process.ts';
import { createTempDir, removeTempDir } from '../helpers/printer-files.ts';
import {
  UNREACHABLE_DATABASE_SECRET,
  UNREACHABLE_DATABASE_URL,
} from '../helpers/unreachable-database.ts';
import { VALID_DATABASE_URL } from './printer-adversarial-helpers.ts';

describe('002 adversarial: configuración de impresión', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  // ADV-002-04 (Bajo, solo Windows): una PRINTER_FILE_DIR relativa a OTRA unidad ('Q:comandas', sin
  // barra después de los dos puntos) no es absoluta, pero path.resolve no la toma desde la raíz del
  // monorepo: usa la carpeta actual de esa unidad (process.cwd() o la variable oculta '=Q:'). La
  // carpeta de las comandas cambia según desde dónde se ejecute el comando, que es justo lo que
  // S-002-09 y D-002-09 prohíben ("nunca desde la carpeta en que se ejecuta el comando"). Relacionado:
  // 'C:' (la unidad del proyecto, sin ruta) se resuelve a la raíz del monorepo y las comandas
  // quedarían sueltas junto a package.json (*.txt no está en .gitignore).
  // Deuda aceptada por el usuario el 2026-10-08 (ver docs/PROGRESS.md). Corregir en la Fase 3 y volver a it(...).
  it.runIf(process.platform === 'win32').fails(
    'ADV-002-04: una ruta relativa a otra unidad no depende de la carpeta actual',
    () => {
      const projectDrive = PROJECT_ROOT_DIR.slice(0, 1).toUpperCase();
      const otherDrive = projectDrive === 'Q' ? 'R' : 'Q';
      vi.stubEnv(`=${otherDrive}:`, undefined);
      const cwd = vi.spyOn(process, 'cwd');
      const resolveFrom = (currentDir: string): string => {
        cwd.mockReturnValue(currentDir);
        return loadConfig({
          DATABASE_URL: VALID_DATABASE_URL,
          PRINTER_FILE_DIR: `${otherDrive}:comandas`,
        }).printer.fileDir;
      };

      const fromFirst = resolveFrom(`${otherDrive}:\\carpeta-uno`);
      const fromSecond = resolveFrom(`${otherDrive}:\\carpeta-dos`);

      expect(path.isAbsolute(fromFirst)).toBe(true);
      expect(fromSecond, `con otra carpeta actual dio ${fromFirst} y ${fromSecond}`).toBe(
        fromFirst,
      );
    },
  );

  // ADV-002-04 (control): las rutas que la spec sí define no dependen de la carpeta actual.
  it.runIf(process.platform === 'win32')(
    'ADV-002-04 (control): relativa, absoluta y "/comandas" no dependen de la carpeta actual',
    () => {
      const cwd = vi.spyOn(process, 'cwd');
      cwd.mockReturnValue('Q:\\otra-carpeta');
      const fileDirOf = (value: string): string =>
        loadConfig({ DATABASE_URL: VALID_DATABASE_URL, PRINTER_FILE_DIR: value }).printer.fileDir;

      expect(fileDirOf('tmp/otra')).toBe(path.join(PROJECT_ROOT_DIR, 'tmp', 'otra'));
      expect(fileDirOf('/comandas')).toBe(path.resolve(PROJECT_ROOT_DIR, '/comandas'));
      expect(fileDirOf('/comandas').slice(0, 2).toUpperCase()).toBe(
        PROJECT_ROOT_DIR.slice(0, 2).toUpperCase(),
      );
    },
  );
});

describe('002 adversarial: pnpm printer:test con entornos raros', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
  });

  afterEach(async () => {
    await killAllChildProcesses();
    await removeTempDir(dir);
  });

  function printEnv(overrides: EnvOverrides): NodeJS.ProcessEnv {
    return buildChildEnv({
      NODE_ENV: 'test',
      DATABASE_URL: UNREACHABLE_DATABASE_URL,
      DATABASE_URL_TEST: undefined,
      HOST: undefined,
      PORT: undefined,
      PRINTER_DRIVER: 'file',
      PRINTER_FILE_DIR: dir,
      ...overrides,
    });
  }

  // ADV-002-15 (regresión en verde): la clave aparece en variables donde nadie la espera (una URL
  // con otro esquema, PRINTER_DRIVER, una DATABASE_URL_TEST que no es _test) o la carpeta tiene un
  // carácter que Windows no admite. El comando termina con código 1, sin la clave, sin la ruta, sin
  // trazas y sin dejar archivos.
  const cases: [string, () => EnvOverrides, string][] = [
    [
      'una DATABASE_URL con otro esquema y la clave',
      () => ({
        DATABASE_URL: `mysql://polleria:${UNREACHABLE_DATABASE_SECRET}@127.0.0.1:1/polleria_test`,
      }),
      'Configuración inválida.',
    ],
    [
      'la clave como PRINTER_DRIVER',
      () => ({ PRINTER_DRIVER: UNREACHABLE_DATABASE_SECRET }),
      '- PRINTER_DRIVER: debe ser file o escpos.',
    ],
    [
      'una DATABASE_URL_TEST con la clave que no termina en _test',
      () => ({
        DATABASE_URL_TEST: `postgres://polleria:${UNREACHABLE_DATABASE_SECRET}@127.0.0.1:1/polleria_dev`,
      }),
      '- DATABASE_URL_TEST:',
    ],
    [
      'una carpeta con un carácter que Windows no admite',
      () => ({ PRINTER_FILE_DIR: path.join(dir, 'mesa<4>') }),
      'Revisa PRINTER_DRIVER y PRINTER_FILE_DIR en backend/.env.',
    ],
  ];

  it.each(
    // El nombre con '<' y '>' solo es inválido en Windows.
    cases.filter(([name]) => process.platform === 'win32' || !name.includes('Windows')),
  )(
    'ADV-002-15: con %s termina con código 1 sin filtrar nada',
    async (_name, overrides, expected) => {
      const result = await runPrintTestPage(printEnv(overrides()), 10_000);

      expect(result.timedOut).toBe(false);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain(expected);
      expect(result.stdout).not.toContain('Hoja de prueba enviada');
      const output = result.stdout + result.stderr;
      expect(output).not.toContain(UNREACHABLE_DATABASE_SECRET);
      expect(output).not.toContain(dir);
      expect(output).not.toMatch(/^\s+at /m);
      expect(await readdir(dir)).toEqual([]);
    },
  );
});
