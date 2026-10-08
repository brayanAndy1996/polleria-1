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
