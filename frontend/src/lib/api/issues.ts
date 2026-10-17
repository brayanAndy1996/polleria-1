import type { z } from 'zod';
import { ApiError } from './client.ts';
import { apiErrorMessage } from './error-message.ts';

/** Un issue de validación con su path ya aplastado a texto ('items.1.productId'). */
export interface FlatIssue {
  path: string;
  message: string;
}

/**
 * Issues de un ApiError VALIDATION_ERROR (details.issues del contrato de errores).
 * Devuelve [] con cualquier otro código o con details sin issues reconocibles.
 */
export function issuesFromApiError(error: unknown): FlatIssue[] {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_ERROR') return [];
  const details: unknown = error.details;
  if (typeof details !== 'object' || details === null || !('issues' in details)) return [];
  const { issues } = details;
  if (!Array.isArray(issues)) return [];
  // Como unknown[] (no any[]) para que 'in' + typeof estrechen de forma segura.
  const list: unknown[] = issues;
  return list.filter(
    (issue): issue is FlatIssue =>
      typeof issue === 'object' &&
      issue !== null &&
      'path' in issue &&
      typeof issue.path === 'string' &&
      'message' in issue &&
      typeof issue.message === 'string',
  );
}

/** Issues de la validación local con un esquema de shared: path unido por puntos. */
export function issuesFromZod(error: z.ZodError): FlatIssue[] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

export interface SplitIssues {
  /** Mensajes por índice de fila del envío (paths 'colección.N.campo'). */
  byIndex: Map<number, string[]>;
  /** Mensajes de conjunto: paths de raíz o ajenos al patrón por fila. */
  root: string[];
}

/**
 * Quita mensajes repetidos preservando el orden de aparición (ADV-008-42): dos
 * issues con el mismo texto —p. ej., un issue de duplicados por cada componente
 * repetido, o el mismo mensaje de esquema dos veces en una fila— no deben
 * mostrarse como alertas idénticas ni repetir la key del render.
 */
export function uniqueMessages(messages: readonly string[]): string[] {
  return [...new Set(messages)];
}

/**
 * Reparte los issues de un PUT de conjunto ('items' o 'portions') entre fila y sección
 * (D-008-12, S-008-12): 'items.2.productId' va a la fila 2 del envío; 'items', 'items.5'
 * (repetidas, sin campo) o cualquier otro path va como mensaje de la sección.
 * `count` acota las filas visibles: un índice fuera de rango sube a la sección en
 * lugar de perderse en silencio (ADV-011-06).
 */
export function splitIssues(
  issues: FlatIssue[],
  collection: 'items' | 'portions',
  count?: number,
): SplitIssues {
  const byIndex = new Map<number, string[]>();
  const root: string[] = [];
  // Ojo: en un template literal '\d' colapsa a 'd'; hace falta '\\d' para que el RegExp vea \d.
  const rowPattern = new RegExp(`^${collection}\\.(\\d+)\\..+`);
  for (const issue of issues) {
    const match = rowPattern.exec(issue.path);
    if (match) {
      const index = Number(match[1]);
      if (count === undefined || (index >= 0 && index < count)) {
        const list = byIndex.get(index) ?? [];
        list.push(issue.message);
        byIndex.set(index, list);
        continue;
      }
    }
    root.push(issue.message);
  }
  return { byIndex, root };
}

/**
 * Mensajes de sección para el error de un PUT de conjunto: los issues de raíz si hay,
 * y si no el apiErrorMessage de siempre (409 con su message, error de red, etc.).
 */
export function sectionMessages(error: unknown, collection: 'items' | 'portions'): SplitIssues {
  const split = splitIssues(issuesFromApiError(error), collection);
  if (split.root.length === 0 && split.byIndex.size === 0) {
    split.root.push(error instanceof Error ? apiErrorMessage(error) : 'Revisa los datos.');
  }
  return split;
}
