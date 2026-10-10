'use client';

import { PRODUCT_CATEGORIES } from '@polleria/shared';
import { PRODUCT_CATEGORY_LABELS } from '../../lib/menu-labels.ts';

/**
 * Grupo 'Categoría' del formulario de producto: un radio por categoría en el orden
 * de la carta (10.3 de la spec 008). Fieldset + legend para el nombre accesible del
 * grupo y radios nativos envueltos en su etiqueta: en el celular se tocan sin puntería
 * y las pruebas los encuentran por nombre.
 */
export function CategoryRadioGroup({
  name,
  value,
  error,
  disabled,
  onChange,
}: {
  name: string;
  value: string;
  error?: string;
  disabled?: boolean;
  onChange: (category: string) => void;
}) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="font-semibold">Categoría</legend>
      <div className="grid gap-2">
        {PRODUCT_CATEGORIES.map((category) => (
          <label
            key={category}
            className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-separator bg-surface px-4"
          >
            <input
              type="radio"
              name={name}
              value={category}
              checked={value === category}
              onChange={() => {
                onChange(category);
              }}
              className="h-5 w-5 accent-accent"
            />
            <span>{PRODUCT_CATEGORY_LABELS[category]}</span>
          </label>
        ))}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </fieldset>
  );
}
