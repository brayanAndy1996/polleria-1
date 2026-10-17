'use client';

import { formatSoles, parseSolesToCents } from '@polleria/shared';
import { LabeledInput } from '../users/labeled-input.tsx';
import type { ProductFieldErrors } from '../../lib/menu-form.ts';
import { CategoryRadioGroup } from './category-radios.tsx';

/**
 * Campos del formulario de producto (alta y datos de la edición): nombre, el grupo
 * de categorías y el precio en soles con su vista previa 'S/ X.XX' cuando el texto
 * parsea (D-008-04). Los errores locales van junto a su campo (10.7).
 */
export function ProductFields({
  idPrefix,
  name,
  category,
  priceText,
  errors,
  referenceNote,
  disabled,
  onNameChange,
  onCategoryChange,
  onPriceChange,
}: {
  idPrefix: string;
  name: string;
  category: string;
  priceText: string;
  errors: ProductFieldErrors;
  /** Nota del precio de referencia: solo aparece en un chicken con presentaciones. */
  referenceNote?: string;
  disabled?: boolean;
  onNameChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onPriceChange: (value: string) => void;
}) {
  const parsedPrice = parseSolesToCents(priceText);
  return (
    <>
      <div className="space-y-2">
        <LabeledInput
          id={`${idPrefix}-nombre`}
          label="Nombre del producto"
          value={name}
          disabled={disabled}
          onChange={(event) => {
            onNameChange(event.target.value);
          }}
        />
        {errors.name && <p className="text-sm text-danger">{errors.name}</p>}
      </div>
      <CategoryRadioGroup
        name={`${idPrefix}-categoria`}
        value={category}
        error={errors.category}
        disabled={disabled}
        onChange={onCategoryChange}
      />
      <div className="space-y-2">
        <LabeledInput
          id={`${idPrefix}-precio`}
          label="Precio"
          inputMode="decimal"
          help="En soles, por ejemplo 18.50."
          value={priceText}
          disabled={disabled}
          onChange={(event) => {
            onPriceChange(event.target.value);
          }}
        />
        {parsedPrice !== null && <p className="text-sm text-muted">{formatSoles(parsedPrice)}</p>}
        {referenceNote && <p className="text-sm text-muted">{referenceNote}</p>}
        {errors.price && <p className="text-sm text-danger">{errors.price}</p>}
      </div>
    </>
  );
}
