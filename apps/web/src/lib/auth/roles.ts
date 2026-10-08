import { hasAnyRole, sortUserRoles } from '@polleria/shared';
import type { UserRole } from '@polleria/shared';

export const ROLE_LABELS = {
  waiter: 'Mozo',
  kitchen: 'Cocina',
  cashier: 'Cajero',
  admin: 'Administrador',
} as const;
export type AreaPath = '/mozo' | '/caja' | '/cocina' | '/admin';
export const AREA_PATHS: readonly AreaPath[] = ['/mozo', '/caja', '/cocina', '/admin'];
export const AREA_LABELS: Readonly<Record<AreaPath, string>> = {
  '/mozo': 'Mozo',
  '/caja': 'Caja',
  '/cocina': 'Cocina',
  '/admin': 'Administración',
};
export const AREA_ALLOWED_ROLES: Readonly<Record<AreaPath, readonly UserRole[]>> = {
  '/mozo': ['waiter', 'admin'],
  '/caja': ['cashier', 'admin'],
  '/cocina': ['kitchen', 'admin'],
  '/admin': ['admin'],
};
export const AREA_SELECTOR_PATH = '/areas';
export function getAllowedAreas(roles: readonly UserRole[]): AreaPath[] {
  return AREA_PATHS.filter((area) => hasAnyRole(roles, AREA_ALLOWED_ROLES[area]));
}
export function resolveLandingPath(
  roles: readonly UserRole[],
  lastArea: string | null,
): AreaPath | '/areas' {
  const areas = getAllowedAreas(roles);
  if (areas.length === 1) return areas[0]!;
  return areas.find((area) => area === lastArea) ?? AREA_SELECTOR_PATH;
}
export function formatRoleLabels(roles: readonly UserRole[]): string {
  return sortUserRoles(roles)
    .map((role) => ROLE_LABELS[role])
    .join(', ');
}
