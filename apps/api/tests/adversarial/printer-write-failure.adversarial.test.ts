/**
 * Fallas del disco a mitad de la escritura del driver file (adversarial-tester, spec 002).
 *
 * Las pruebas del test-writer simulan fallas del renombrado (AC-24 y AC-25) y de la carpeta
 * (AC-26), pero ninguna falla mientras el archivo temporal está abierto. Aquí `open` de
 * node:fs/promises devuelve un FileHandle real envuelto que falla en writeFile (después de escribir
 * una parte), en datasync o en close. RN-002-05: nunca queda un .txt a medias, ni un .tmp de este
 * trabajo, ni el archivo abierto (D-002-08, paso 6).
 *
 * El mock vive en su propio archivo para no afectar a las demás pruebas. Carpeta propia bajo
 * os.tmpdir() (R-002-05).
 */
import type { FileHandle } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFilePrinterDriver } from '../../src/services/printer/file-driver.ts';
import { buildJob, createTempDir, removeTempDir } from '../helpers/printer-files.ts';
import { expectPrinterError, rejectionOf } from '../helpers/printer-fixtures.ts';

type FailureStage = 'writeFile' | 'datasync' | 'close';

const control = vi.hoisted(() => {
  const state: { stage: FailureStage | undefined; opened: FileHandle[] } = {
    stage: undefined,
    opened: [],
  };

  /** Error de Node simulado: el mensaje trae una ruta, como los reales. */
  function systemError(code: string): Error {
    return Object.assign(new Error(`${code}: error simulado, C:\\secreto\\comandas\\x.tmp`), {
      code,
    });
  }

  /** Envuelve el FileHandle real: solo los métodos que usa el driver (writeFile, datasync, close). */
  function faultyHandle(real: FileHandle, stage: FailureStage): FileHandle {
    const wrapper = {
      async writeFile(data: string, encoding: BufferEncoding): Promise<void> {
        if (stage === 'writeFile') {
          // El disco se llena a mitad: una parte del contenido sí llega al temporal.
          await real.write(data.slice(0, Math.ceil(data.length / 2)));
          throw systemError('ENOSPC');
        }
        await real.writeFile(data, encoding);
      },
      async datasync(): Promise<void> {
        if (stage === 'datasync') {
          throw systemError('EIO');
        }
        await real.datasync();
      },
      async close(): Promise<void> {
        await real.close();
        if (stage === 'close') {
          throw systemError('EIO');
        }
      },
    };
    return wrapper as unknown as FileHandle;
  }

  return { state, faultyHandle };
});

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  const open: typeof actual.open = async (...args) => {
    const real = await actual.open(...args);
    control.state.opened.push(real);
    const { stage } = control.state;
    return stage === undefined ? real : control.faultyHandle(real, stage);
  };
  return { ...actual, open };
});

describe('002 adversarial: fallas a mitad de la escritura del driver file', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
    control.state.stage = undefined;
    control.state.opened = [];
  });

  afterEach(async () => {
    control.state.stage = undefined;
    await removeTempDir(dir);
  });

  // ADV-002-14 (regresión en verde): disco lleno en writeFile (con medio contenido ya escrito), error
  // de E/S en datasync y error al cerrar. En los tres casos: PRINTER_OUTPUT_FAILED sin la ruta, la
  // carpeta queda vacía (ni .txt ni .tmp) y el archivo temporal quedó cerrado.
  it.each<FailureStage>(['writeFile', 'datasync', 'close'])(
    'ADV-002-14: si falla %s no queda ni .txt ni .tmp y el temporal queda cerrado',
    async (stage) => {
      control.state.stage = stage;
      const driver = createFilePrinterDriver({ dir });

      const error = await rejectionOf(driver.print(buildJob(['Hola', 'x'.repeat(48), 'Fin'])));

      expectPrinterError(error, 'PRINTER_OUTPUT_FAILED');
      expect(`${error.message}\n${String(error)}\n${JSON.stringify(error)}`).not.toContain(
        'secreto',
      );
      expect(await readdir(dir)).toEqual([]);
      expect(control.state.opened).toHaveLength(1);
      // FileHandle.fd vale -1 cuando el archivo ya está cerrado.
      expect(control.state.opened.map((handle) => handle.fd)).toEqual([-1]);
    },
  );

  it('ADV-002-14 (control): sin falla simulada el mismo driver escribe el archivo completo', async () => {
    const driver = createFilePrinterDriver({ dir });

    await driver.print(buildJob(['Hola']));

    expect(await readdir(dir)).toEqual(['20261007-153012-123-prueba-a1b2c3d4.txt']);
    expect(control.state.opened.map((handle) => handle.fd)).toEqual([-1]);
  });
});
