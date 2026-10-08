'use client';

import { Input, Label } from '@heroui/react';
import type { ComponentProps } from 'react';

/**
 * Campo de texto con etiqueta. La asociación etiqueta-campo es solo por
 * htmlFor + id: el Label de React Aria dentro de un TextField agregaría además
 * aria-labelledby y la misma etiqueta contaría dos veces para las pruebas y
 * lectores de pantalla.
 */
export function LabeledInput({
  id,
  label,
  help,
  ...inputProps
}: ComponentProps<typeof Input> & { id: string; label: string; help?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} fullWidth {...inputProps} />
      {help && <p className="text-sm text-muted">{help}</p>}
    </div>
  );
}
