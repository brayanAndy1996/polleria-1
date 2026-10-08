'use client';

import { Button } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { strongPinSchema, updateUserRequestSchema } from '@polleria/shared';
import type { AdminUser, UpdateUserRequest, UserRole } from '@polleria/shared';
import { useParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { RoleGuard, useSessionQuery } from '../../../../components/auth/role-guard.tsx';
import { LabeledInput } from '../../../../components/users/labeled-input.tsx';
import { RoleCheckboxes } from '../../../../components/users/role-checkboxes.tsx';
import { apiErrorMessage } from '../../../../lib/api/error-message.ts';
import { getUsers, resetUserPin, updateUser } from '../../../../lib/api/users.ts';

function EditUser({ userId }: { userId: number }) {
  const session = useSessionQuery();
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: getUsers, retry: false });
  // `saved` guarda el último AdminUser confirmado por la API junto con la fila que
  // la lista tenía al confirmar: la respuesta del PATCH es la fuente visible de
  // inmediato, pero cede apenas el refetch trae un objeto distinto para el
  // usuario (el structural sharing de la query conserva la referencia cuando el
  // contenido es el mismo). Así una lista refrescada con datos más nuevos gana.
  const [saved, setSaved] = useState<{
    user: AdminUser;
    listedAtSave: AdminUser | undefined;
  }>();
  const listed = users.data?.find((user) => user.id === userId);
  const user =
    saved !== undefined && saved.user.id === userId && saved.listedAtSave === listed
      ? saved.user
      : listed;

  // Los campos del perfil arrancan del usuario cargado; cada edición local se
  // guarda aparte y, al confirmar el servidor, el `saved` nuevo vuelve a ser base.
  const [nameEdit, setNameEdit] = useState<string>();
  const [rolesEdit, setRolesEdit] = useState<UserRole[]>();
  const [pin, setPin] = useState('');
  const [pinRepeat, setPinRepeat] = useState('');
  const [confirmingPin, setConfirmingPin] = useState(false);
  const [confirmingStatus, setConfirmingStatus] = useState(false);
  const [profileLocalError, setProfileLocalError] = useState<string>();
  const [pinLocalError, setPinLocalError] = useState<string>();

  const isSelf = session.data?.user.id === userId;
  const afterChange = (changed: AdminUser | undefined) => {
    if (changed) {
      setSaved({ user: changed, listedAtSave: listed });
      setNameEdit(undefined);
      setRolesEdit(undefined);
    }
    void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    if (isSelf) void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
  };
  // Un solo envío en vuelo por acción: `isPending` no voltea hasta el siguiente
  // render, así que un doble toque en el mismo tick llega con el estado en falso;
  // la marca síncrona lo bloquea igual que en el alta (ADV-004-31).
  const profileSending = useRef(false);
  const pinSending = useRef(false);
  const statusSending = useRef(false);
  const profile = useMutation({
    mutationFn: (input: UpdateUserRequest) => updateUser(userId, input),
    onSuccess: afterChange,
    onSettled: () => {
      profileSending.current = false;
    },
  });
  const pinReset = useMutation({
    mutationFn: (value: string) => resetUserPin(userId, value),
    onSuccess: () => {
      afterChange(undefined);
      setPin('');
      setPinRepeat('');
      setConfirmingPin(false);
    },
    onError: () => {
      // Como el alta y el login: tras un error del servidor los PIN quedan
      // vacíos para que no queden visibles (ADV-004-38).
      setPin('');
      setPinRepeat('');
    },
    onSettled: () => {
      pinSending.current = false;
    },
  });
  const statusChange = useMutation({
    mutationFn: (input: UpdateUserRequest) => updateUser(userId, input),
    onSuccess: (changed) => {
      afterChange(changed);
    },
    onSettled: () => {
      statusSending.current = false;
    },
  });

  if (users.isPending)
    return (
      <p role="status" className="p-6 text-center">
        Cargando...
      </p>
    );
  if (users.isError)
    return (
      <div className="space-y-4 p-6 text-center">
        <p role="alert">No se pudo cargar la lista de usuarios.</p>
        <Button
          className="min-h-12"
          onPress={() => {
            void users.refetch();
          }}
        >
          Reintentar
        </Button>
      </div>
    );
  if (!user)
    return (
      <p role="alert" className="text-danger">
        Ese usuario no existe.
      </p>
    );

  const displayName = nameEdit ?? user.displayName;
  const roles = rolesEdit ?? user.roles;

  const saveProfile = () => {
    if (profileSending.current || profile.isPending) return;
    const parsed = updateUserRequestSchema.safeParse({ displayName, roles });
    if (!parsed.success) {
      setProfileLocalError(parsed.error.issues[0]?.message ?? 'Revisa los datos.');
      return;
    }
    setProfileLocalError(undefined);
    profileSending.current = true;
    profile.mutate(parsed.data);
  };
  const askPinReset = () => {
    if (pin !== pinRepeat) {
      setPinLocalError('Los PIN no coinciden.');
      return;
    }
    const parsed = strongPinSchema.safeParse(pin);
    if (!parsed.success) {
      setPinLocalError(parsed.error.issues[0]?.message ?? 'Revisa el PIN.');
      return;
    }
    setPinLocalError(undefined);
    setConfirmingPin(true);
  };
  const confirmPinReset = () => {
    if (pinSending.current || pinReset.isPending) return;
    setConfirmingPin(false);
    pinSending.current = true;
    pinReset.mutate(pin);
  };
  const changeStatus = (isActive: boolean) => {
    if (statusSending.current || statusChange.isPending) return;
    // La confirmación se cierra al enviar: si la API falla, el error se muestra en la
    // sección y el botón Desactivar/Activar vuelve a estar disponible.
    setConfirmingStatus(false);
    statusSending.current = true;
    statusChange.mutate({ isActive });
  };

  const profileMessage =
    profileLocalError ??
    (profile.isError
      ? apiErrorMessage(profile.error)
      : profile.isSuccess
        ? 'Cambios guardados.'
        : undefined);
  const pinMessage =
    pinLocalError ??
    (pinReset.isError
      ? apiErrorMessage(pinReset.error)
      : pinReset.isSuccess
        ? 'PIN actualizado.'
        : undefined);
  const statusMessage = statusChange.isError ? apiErrorMessage(statusChange.error) : undefined;

  return (
    <>
      <div>
        <h1 className="text-3xl font-bold">Editar usuario</h1>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <p className="text-muted wrap-anywhere">{user.username}</p>
          {!user.isActive && <p className="font-semibold text-danger">Desactivado</p>}
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Perfil</h2>
        <LabeledInput
          id="editar-display-name"
          label="Nombre para mostrar"
          value={displayName}
          onChange={(event) => {
            setNameEdit(event.target.value);
          }}
        />
        <RoleCheckboxes
          selected={roles}
          onToggle={(role, selected) => {
            setRolesEdit(selected ? [...roles, role] : roles.filter((item) => item !== role));
          }}
          disabled={profile.isPending}
        />
        {profileMessage && (
          <p
            role={profile.isSuccess && !profileLocalError ? 'status' : 'alert'}
            className={profile.isError || profileLocalError ? 'text-danger' : ''}
          >
            {profileMessage}
          </p>
        )}
        <Button
          className="min-h-12 w-full text-lg"
          isDisabled={profile.isPending}
          onPress={saveProfile}
        >
          {profile.isPending ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">PIN</h2>
        <LabeledInput
          id="editar-pin"
          label="PIN nuevo"
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(event) => {
            setPin(event.target.value);
          }}
        />
        <LabeledInput
          id="editar-pin-repeat"
          label="Repetir PIN nuevo"
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={pinRepeat}
          onChange={(event) => {
            setPinRepeat(event.target.value);
          }}
        />
        {pinMessage && (
          <p
            role={pinReset.isSuccess && !pinLocalError ? 'status' : 'alert'}
            className={pinReset.isError || pinLocalError ? 'text-danger' : ''}
          >
            {pinMessage}
          </p>
        )}
        {confirmingPin ? (
          <div className="space-y-3 rounded-xl border border-separator p-4">
            <p>Se cerrarán las sesiones de {user.displayName}. ¿Restablecer su PIN?</p>
            <div className="flex flex-wrap gap-3">
              <Button
                className="min-h-12"
                isDisabled={pinReset.isPending}
                onPress={confirmPinReset}
              >
                Sí, restablecer
              </Button>
              <Button
                variant="secondary"
                className="min-h-12"
                isDisabled={pinReset.isPending}
                onPress={() => {
                  setConfirmingPin(false);
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="secondary"
            className="min-h-12 w-full text-lg"
            isDisabled={pinReset.isPending}
            onPress={askPinReset}
          >
            Restablecer PIN
          </Button>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Estado</h2>
        {statusMessage && (
          <p role="alert" className="text-danger">
            {statusMessage}
          </p>
        )}
        {user.isActive ? (
          confirmingStatus ? (
            <div className="space-y-3 rounded-xl border border-separator p-4">
              <p>¿Desactivar a {user.displayName}? No podrá iniciar sesión.</p>
              <div className="flex flex-wrap gap-3">
                <Button
                  className="min-h-12"
                  isDisabled={statusChange.isPending}
                  onPress={() => {
                    changeStatus(false);
                  }}
                >
                  Sí, desactivar
                </Button>
                <Button
                  variant="secondary"
                  className="min-h-12"
                  isDisabled={statusChange.isPending}
                  onPress={() => {
                    setConfirmingStatus(false);
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="secondary"
              className="min-h-12 w-full text-lg"
              isDisabled={statusChange.isPending}
              onPress={() => {
                setConfirmingStatus(true);
              }}
            >
              Desactivar
            </Button>
          )
        ) : (
          <Button
            className="min-h-12 w-full text-lg"
            isDisabled={statusChange.isPending}
            onPress={() => {
              changeStatus(true);
            }}
          >
            {statusChange.isPending ? 'Activando...' : 'Activar'}
          </Button>
        )}
      </section>
    </>
  );
}

export default function Page() {
  const params = useParams<{ id: string }>();
  // `key` reinicia el formulario si la ruta cambia de usuario sin desmontar.
  return (
    <RoleGuard area="/admin">
      <EditUser key={params.id} userId={Number(params.id)} />
    </RoleGuard>
  );
}
