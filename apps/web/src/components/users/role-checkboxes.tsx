'use client';

import { Checkbox } from '@heroui/react';
import { USER_ROLES } from '@polleria/shared';
import type { UserRole } from '@polleria/shared';
import { ROLE_LABELS } from '../../lib/auth/roles.ts';

/**
 * Un checkbox por rol, en el orden fijo de USER_ROLES (Mozo, Cocina, Cajero,
 * Administrador). La etiqueta del checkbox es el nombre visible del rol, así el
 * control accesible queda nombrado 'Mozo', 'Cocina', etc.
 */
export function RoleCheckboxes({
  selected,
  onToggle,
  disabled = false,
}: {
  selected: readonly UserRole[];
  onToggle: (role: UserRole, selected: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">Roles</legend>
      {USER_ROLES.map((role) => (
        <Checkbox
          key={role}
          isSelected={selected.includes(role)}
          isDisabled={disabled}
          onChange={(isSelected) => {
            onToggle(role, isSelected);
          }}
        >
          <Checkbox.Content className="flex min-h-12 items-center gap-3">
            {/* El control visual no puede interceptar los clics: el input real
                queda debajo y tanto los clics del usuario como los de las
                pruebas deben llegar hasta él a través de la etiqueta. */}
            <Checkbox.Control className="pointer-events-none">
              <Checkbox.Indicator />
            </Checkbox.Control>
            {ROLE_LABELS[role]}
          </Checkbox.Content>
        </Checkbox>
      ))}
    </fieldset>
  );
}
