'use client';

import { Button } from '@heroui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createUserRequestSchema } from '@polleria/shared';
import type { UserRole } from '@polleria/shared';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { RoleGuard } from '../../../../components/auth/role-guard.tsx';
import { LabeledInput } from '../../../../components/users/labeled-input.tsx';
import { RoleCheckboxes } from '../../../../components/users/role-checkboxes.tsx';
import { apiErrorMessage } from '../../../../lib/api/error-message.ts';
import { createUser } from '../../../../lib/api/users.ts';
import { usePrimaryInstance } from '../../../../lib/primary-instance.ts';

function NewUserForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [pin, setPin] = useState('');
  const [pinRepeat, setPinRepeat] = useState('');
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [localError, setLocalError] = useState<string>();
  // Un solo envío en vuelo: evita que un doble toque cree dos solicitudes.
  const sending = useRef(false);
  const create = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      router.replace('/admin/usuarios');
    },
    onError: () => {
      // Como el teclado del login: tras un error del servidor los PIN quedan vacíos.
      setPin('');
      setPinRepeat('');
    },
    onSettled: () => {
      sending.current = false;
    },
  });
  const toggleRole = (role: UserRole, selected: boolean) => {
    setRoles((current) =>
      selected ? [...current, role] : current.filter((item) => item !== role),
    );
  };
  const submit = () => {
    if (sending.current || create.isPending) return;
    if (pin !== pinRepeat) {
      setLocalError('Los PIN no coinciden.');
      return;
    }
    const parsed = createUserRequestSchema.safeParse({ username, displayName, pin, roles });
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message ?? 'Revisa los datos.');
      return;
    }
    setLocalError(undefined);
    sending.current = true;
    // La repetición del PIN no viaja: solo las cuatro claves del contrato.
    create.mutate(parsed.data);
  };
  const message = localError ?? (create.error ? apiErrorMessage(create.error) : undefined);
  return (
    <>
      <h1 className="text-3xl font-bold">Agregar usuario</h1>
      <div className="space-y-5">
        <LabeledInput
          id="nuevo-username"
          label="Nombre de usuario"
          help="Letras minúsculas sin tilde, números, punto, guion o guion bajo."
          value={username}
          onChange={(event) => {
            setUsername(event.target.value);
          }}
        />
        <LabeledInput
          id="nuevo-display-name"
          label="Nombre para mostrar"
          value={displayName}
          onChange={(event) => {
            setDisplayName(event.target.value);
          }}
        />
        <LabeledInput
          id="nuevo-pin"
          label="PIN"
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(event) => {
            setPin(event.target.value);
          }}
        />
        <LabeledInput
          id="nuevo-pin-repeat"
          label="Repetir PIN"
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={pinRepeat}
          onChange={(event) => {
            setPinRepeat(event.target.value);
          }}
        />
        <RoleCheckboxes selected={roles} onToggle={toggleRole} disabled={create.isPending} />
        {message && (
          <p role="alert" className="text-danger">
            {message}
          </p>
        )}
        <Button className="min-h-12 w-full text-lg" isDisabled={create.isPending} onPress={submit}>
          {create.isPending ? 'Creando...' : 'Crear usuario'}
        </Button>
      </div>
    </>
  );
}

export default function Page() {
  const primary = usePrimaryInstance();
  return <RoleGuard area="/admin">{primary ? <NewUserForm /> : null}</RoleGuard>;
}
