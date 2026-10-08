import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildChildEnv,
  getFreePort,
  killAllChildProcesses,
  runPrintTestPage,
  startServer,
} from './helpers/child-process.ts';
import type { EnvOverrides } from './helpers/child-process.ts';
import { createTempDir, expectedTestPageLines, removeTempDir } from './helpers/printer-files.ts';
import {
  UNREACHABLE_DATABASE_SECRET,
  UNREACHABLE_DATABASE_URL,
} from './helpers/unreachable-database.ts';

const PROCESS_LIMIT_MS = 10_000;

const ESCPOS_ISSUE_LINE =
  '- PRINTER_DRIVER: escpos todavía no está disponible en esta versión; usa file.';
const NO_PRINT_MESSAGE = 'No se pudo imprimir. Revisa la impresora e intenta de nuevo.';
const CHECK_CONFIG_LINE = 'Revisa PRINTER_DRIVER y PRINTER_FILE_DIR en apps/api/.env.';

describe('002: procesos de impresión (server.ts y print-test-page.ts)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
  });

  afterEach(async () => {
    await killAllChildProcesses();
    await removeTempDir(dir);
  });

  /** Entorno del comando de la hoja de prueba: DATABASE_URL inalcanzable y carpeta temporal propia. */
  function printEnv(overrides: EnvOverrides = {}): NodeJS.ProcessEnv {
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

  describe('AC-06: la API no arranca con PRINTER_DRIVER=escpos', () => {
    it('AC-06: termina sola con código 1 y explica que escpos todavía no está disponible', async () => {
      const port = await getFreePort();
      const server = startServer(
        buildChildEnv({
          DATABASE_URL: UNREACHABLE_DATABASE_URL,
          DATABASE_URL_TEST: undefined,
          NODE_ENV: 'test',
          HOST: '127.0.0.1',
          PORT: String(port),
          PRINTER_DRIVER: 'escpos',
          PRINTER_FILE_DIR: undefined,
        }),
      );

      const result = await server.waitForExit(PROCESS_LIMIT_MS);

      expect(result.timedOut).toBe(false);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Configuración inválida.');
      expect(result.stderr).toContain(ESCPOS_ISSUE_LINE);
      expect(result.stdout).not.toContain('API escuchando');
      expect(result.stdout + result.stderr).not.toContain(UNREACHABLE_DATABASE_SECRET);
    });
  });

  describe('AC-30: pnpm printer:test imprime la hoja de prueba', () => {
    it('AC-30: termina con código 0, informa el destino y deja un solo .txt con la hoja', async () => {
      const result = await runPrintTestPage(printEnv(), PROCESS_LIMIT_MS);

      expect(result.timedOut).toBe(false);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Hoja de prueba enviada con el driver file.');

      const destinationMatch = /^Destino: (.+?)\r?$/m.exec(result.stdout);
      expect(destinationMatch, `stdout: ${result.stdout}`).not.toBeNull();
      const destination = destinationMatch?.[1] ?? '';
      expect(path.extname(destination)).toBe('.txt');
      expect(path.resolve(path.dirname(destination))).toBe(path.resolve(dir));
      // El nombre cumple JOB_ID_PATTERN con la etiqueta 'prueba'. El módulo se importa aquí y no al
      // inicio para que AC-06 no dependa de él.
      const { JOB_ID_PATTERN } = await import('../src/services/printer/print-job.ts');
      const jobId = path.basename(destination, '.txt');
      expect(jobId).toMatch(JOB_ID_PATTERN);
      expect(jobId).toMatch(/^\d{8}-\d{6}-\d{3}-prueba-[0-9a-f]{8}$/);

      const files = await readdir(dir);
      expect(files).toEqual([path.basename(destination)]);

      const content = await readFile(path.join(dir, files[0] ?? ''), 'utf8');
      expect(content.endsWith('\n')).toBe(true);
      const lines = content.slice(0, -1).split('\n');
      expect(lines).toHaveLength(9);
      expect(lines[3]).toMatch(/^Fecha: \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/);
      const expected = expectedTestPageLines();
      expect(lines.filter((_, index) => index !== 3)).toEqual(
        expected.filter((_, index) => index !== 3),
      );

      expect(result.stdout + result.stderr).not.toContain(UNREACHABLE_DATABASE_SECRET);
    });
  });

  describe('AC-31: pnpm printer:test falla con un mensaje claro', () => {
    it('AC-31: con PRINTER_DRIVER=escpos termina con código 1 y explica la configuración inválida', async () => {
      const result = await runPrintTestPage(
        printEnv({ PRINTER_DRIVER: 'escpos' }),
        PROCESS_LIMIT_MS,
      );

      expect(result.timedOut).toBe(false);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Configuración inválida.');
      expect(result.stderr).toContain(ESCPOS_ISSUE_LINE);
      expect(result.stdout).not.toContain('Hoja de prueba enviada');
      expect(result.stdout + result.stderr).not.toContain(UNREACHABLE_DATABASE_SECRET);
    });

    it('AC-31: con PRINTER_FILE_DIR apuntando a un archivo termina con código 1, sin la ruta ni trazas', async () => {
      const filePath = path.join(dir, 'soy-un-archivo');
      await writeFile(filePath, 'contenido original');

      const result = await runPrintTestPage(
        printEnv({ PRINTER_FILE_DIR: filePath }),
        PROCESS_LIMIT_MS,
      );

      expect(result.timedOut).toBe(false);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain(NO_PRINT_MESSAGE);
      expect(result.stderr).toContain(CHECK_CONFIG_LINE);
      expect(result.stderr).not.toContain(filePath);
      expect(result.stderr).not.toContain('soy-un-archivo');
      expect(result.stderr).not.toContain(dir);
      expect(result.stderr).not.toMatch(/^\s+at /m);
      expect(result.stdout).not.toContain('Hoja de prueba enviada');
      expect(result.stdout + result.stderr).not.toContain(UNREACHABLE_DATABASE_SECRET);
      expect(await readFile(filePath, 'utf8')).toBe('contenido original');
    });

    it('AC-31: sin DATABASE_URL termina con código 1 y explica la configuración inválida', async () => {
      const result = await runPrintTestPage(
        printEnv({ DATABASE_URL: undefined }),
        PROCESS_LIMIT_MS,
      );

      expect(result.timedOut).toBe(false);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Configuración inválida.');
      expect(result.stdout).not.toContain('Hoja de prueba enviada');
      expect(result.stdout + result.stderr).not.toContain(UNREACHABLE_DATABASE_SECRET);
    });
  });
});
