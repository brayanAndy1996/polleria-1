import { AREA_PATHS } from './roles.ts';
import type { AreaPath } from './roles.ts';

export const LAST_AREA_STORAGE_KEY = 'polleria:lastArea';
export function readLastArea(): AreaPath | null {
  try {
    const value = window.localStorage.getItem(LAST_AREA_STORAGE_KEY);
    return AREA_PATHS.find((area) => area === value) ?? null;
  } catch {
    return null;
  }
}
export function saveLastArea(area: AreaPath): void {
  try {
    window.localStorage.setItem(LAST_AREA_STORAGE_KEY, area);
  } catch {
    return;
  }
}
/**
 * Áreas que cuentan como puesto de trabajo compartido. /admin queda fuera: es una sesión
 * de administración, no el uso habitual del dispositivo. Por eso, tras usar /admin, el
 * equipo no aterriza directo en esa área ni conserva el teclado del último usuario: /login
 * vuelve a mostrar la lista y el siguiente inicio pasa por /areas (spec 004, AC-26/AC-27).
 */
const WORKSTATION_AREA_PATHS: readonly AreaPath[] = ['/mozo', '/caja', '/cocina'];
/**
 * Última área solo si fue un puesto de trabajo. Devuelve null para '/admin', para valores
 * inválidos o si localStorage falla, igual que readLastArea.
 */
export function readLastWorkstationArea(): AreaPath | null {
  const area = readLastArea();
  return WORKSTATION_AREA_PATHS.find((workstation) => workstation === area) ?? null;
}
/** True cuando la última área usada en el dispositivo fue Administración (/admin). */
export function wasLastAreaAdministration(): boolean {
  return readLastArea() === '/admin';
}
