/**
 * Carpetas temporales y textos esperados de las pruebas de impresión (spec 002).
 *
 * Reglas que cumple este archivo (R-002-05):
 * - Las carpetas de prueba se crean siempre bajo os.tmpdir(); ninguna prueba escribe en
 *   tmp/comandas del proyecto.
 * - No importa código de producción (solo tipos): sirve también a las pruebas de procesos.
 * - Los textos esperados se escriben aquí con los valores de la spec, no se importan del código de
 *   producción, para que un error de la implementación no se copie también en la prueba.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { PrintJob } from '../../src/services/printer/print-job.ts';

/** Trabajo de ejemplo de la sección 4.5 de la spec. */
export const JOB_ID = '20261007-153012-123-prueba-a1b2c3d4';

export function buildJob(lines: readonly string[] = ['Hola']): PrintJob {
  return { jobId: JOB_ID, label: 'prueba', lines };
}

/** Carpeta temporal propia de una prueba. Se borra con removeTempDir. */
export async function createTempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'polleria-printer-'));
}

export async function removeTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

/** Las 9 líneas de la hoja de prueba (AC-29). La cuarta es la fecha, que cambia en cada corrida. */
export function expectedTestPageLines(dateLine = 'Fecha: 07/10/2026 15:30:12'): string[] {
  return [
    '='.repeat(48),
    'HOJA DE PRUEBA - SISTEMA POLLERÍA',
    'Driver: file',
    dateLine,
    'Ancho: 48 columnas',
    '123456789012345678901234567890123456789012345678',
    'Tildes: áéíóúüñ ÁÉÍÓÚÜÑ ¿¡ °ºª',
    'Si lees esto, la impresión funciona.',
    '='.repeat(48),
  ];
}
