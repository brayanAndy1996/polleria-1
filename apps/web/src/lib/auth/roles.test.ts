import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserRole } from '@polleria/shared';
import {
  AREA_PATHS,
  AREA_LABELS,
  AREA_ALLOWED_ROLES,
  AREA_SELECTOR_PATH,
  ROLE_LABELS,
  formatRoleLabels,
  getAllowedAreas,
  resolveLandingPath,
} from './roles.ts';
import { LAST_AREA_STORAGE_KEY, readLastArea, saveLastArea } from './last-area.ts';
import { LAST_USERNAME_STORAGE_KEY, readLastUsername, saveLastUsername } from './last-user.ts';

describe('003: roles, áreas y preferencias del equipo', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  it('AC-41: las áreas y sus roles son explícitos y estables', () => {
    expect(AREA_PATHS).toEqual(['/mozo', '/caja', '/cocina', '/admin']);
    expect(AREA_LABELS).toEqual({
      '/mozo': 'Mozo',
      '/caja': 'Caja',
      '/cocina': 'Cocina',
      '/admin': 'Administración',
    });
    expect(AREA_ALLOWED_ROLES).toEqual({
      '/mozo': ['waiter', 'admin'],
      '/caja': ['cashier', 'admin'],
      '/cocina': ['kitchen', 'admin'],
      '/admin': ['admin'],
    });
    expect(AREA_SELECTOR_PATH).toBe('/areas');
    expect(ROLE_LABELS).toEqual({
      waiter: 'Mozo',
      kitchen: 'Cocina',
      cashier: 'Cajero',
      admin: 'Administrador',
    });
    expect(formatRoleLabels(['cashier', 'waiter'])).toBe('Mozo, Cajero');
    expect(formatRoleLabels(['admin'])).toBe('Administrador');
  });
  it.each([
    [['waiter'], ['/mozo']],
    [['cashier'], ['/caja']],
    [['kitchen'], ['/cocina']],
    [
      ['waiter', 'cashier'],
      ['/mozo', '/caja'],
    ],
    [
      ['cashier', 'waiter'],
      ['/mozo', '/caja'],
    ],
    [
      ['waiter', 'kitchen'],
      ['/mozo', '/cocina'],
    ],
    [
      ['kitchen', 'cashier'],
      ['/caja', '/cocina'],
    ],
    [
      ['waiter', 'kitchen', 'cashier'],
      ['/mozo', '/caja', '/cocina'],
    ],
    [['admin'], ['/mozo', '/caja', '/cocina', '/admin']],
    [
      ['waiter', 'admin'],
      ['/mozo', '/caja', '/cocina', '/admin'],
    ],
  ])('AC-41: calcula las áreas de %s en orden', (roles, expected) => {
    expect(getAllowedAreas(roles as UserRole[])).toEqual(expected);
  });
  it.each([
    [['waiter'], null, '/mozo'],
    [['waiter'], '/caja', '/mozo'],
    [['cashier'], '/mozo', '/caja'],
    [['waiter', 'cashier'], null, '/areas'],
    [['waiter', 'cashier'], '/caja', '/caja'],
    [['waiter', 'cashier'], '/cocina', '/areas'],
    [['waiter', 'cashier'], '/areas', '/areas'],
    [['admin'], null, '/areas'],
    [['admin'], '/cocina', '/cocina'],
    [['admin'], '/admin', '/admin'],
  ])('AC-41: resuelve el destino de %s con última área %s', (roles, lastArea, expected) => {
    expect(resolveLandingPath(roles as UserRole[], lastArea)).toBe(expected);
  });
  it('AC-41: guarda solo áreas válidas y tolera localStorage no disponible', () => {
    expect(LAST_AREA_STORAGE_KEY).toBe('polleria:lastArea');
    expect(readLastArea()).toBeNull();
    saveLastArea('/caja');
    expect(localStorage.getItem(LAST_AREA_STORAGE_KEY)).toBe('/caja');
    expect(readLastArea()).toBe('/caja');
    for (const area of ['/areas', '/login', 'caja', '']) {
      localStorage.setItem(LAST_AREA_STORAGE_KEY, area);
      expect(readLastArea()).toBeNull();
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('No disponible');
    });
    expect(readLastArea()).toBeNull();
    expect(readLastUsername()).toBeNull();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('No disponible');
    });
    expect(() => saveLastArea('/mozo')).not.toThrow();
    expect(() => saveLastUsername('mozo.juan')).not.toThrow();
  });
  it('AC-32: recuerda solo el nombre de usuario, sin datos del PIN', () => {
    expect(LAST_USERNAME_STORAGE_KEY).toBe('polleria:lastUsername');
    expect(readLastUsername()).toBeNull();
    saveLastUsername('mozo.juan');
    expect(readLastUsername()).toBe('mozo.juan');
    expect(localStorage.length).toBe(1);
  });
});
