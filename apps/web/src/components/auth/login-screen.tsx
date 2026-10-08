'use client';

import { Button } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PIN_MIN_LENGTH, PIN_MAX_LENGTH } from '@polleria/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getLoginUsers, getSession, login } from '../../lib/api/auth.ts';
import { ApiError } from '../../lib/api/client.ts';
import { readLastArea } from '../../lib/auth/last-area.ts';
import { readLastUsername, saveLastUsername } from '../../lib/auth/last-user.ts';
import { resolveLandingPath } from '../../lib/auth/roles.ts';

function loginErrorMessage(error: Error | null): string | undefined {
  if (error === null) return undefined;
  if (error instanceof ApiError && error.code === 'TOO_MANY_ATTEMPTS') {
    const details = error.details;
    const seconds =
      typeof details === 'object' &&
      details !== null &&
      'retryAfterSeconds' in details &&
      typeof details.retryAfterSeconds === 'number' &&
      details.retryAfterSeconds > 0
        ? details.retryAfterSeconds
        : 900;
    const minutes = Math.ceil(seconds / 60);
    return `Demasiados intentos fallidos. Intenta de nuevo en ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.`;
  }
  return error.message;
}
export function LoginScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => getSession({ skipAuthRedirect: true }),
    retry: false,
  });
  const users = useQuery({
    queryKey: ['auth', 'users'],
    queryFn: getLoginUsers,
    enabled: !session.isPending && !session.data,
    retry: false,
  });
  const [rememberedUsername] = useState(readLastUsername);
  const [chosenUsername, setChosenUsername] = useState<string | null | undefined>(undefined);
  const [pin, setPin] = useState('');
  const sending = useRef(false);
  const selected = users.data?.find(
    (user) =>
      user.username === (chosenUsername === undefined ? rememberedUsername : chosenUsername),
  );
  const { mutate, isPending, error, reset } = useMutation({
    mutationFn: login,
    onSuccess: (response, input) => {
      saveLastUsername(input.username);
      queryClient.setQueryData(['auth', 'me'], response);
    },
  });
  useEffect(() => {
    if (session.data) router.replace(resolveLandingPath(session.data.user.roles, readLastArea()));
  }, [session.data, router]);
  const submit = useCallback(() => {
    if (!selected || pin.length < PIN_MIN_LENGTH || sending.current) return;
    sending.current = true;
    mutate(
      { username: selected.username, pin },
      {
        onError: () => {
          setPin('');
        },
        onSettled: () => {
          sending.current = false;
        },
      },
    );
  }, [selected, pin, mutate]);
  const addDigit = useCallback(
    (digit: string) => {
      if (isPending) return;
      reset();
      setPin((current) => (current.length < PIN_MAX_LENGTH ? current + digit : current));
    },
    [isPending, reset],
  );
  const eraseDigit = useCallback(() => {
    if (!isPending) {
      reset();
      setPin((current) => current.slice(0, -1));
    }
  }, [isPending, reset]);
  useEffect(() => {
    if (!selected || isPending) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        addDigit(event.key);
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        eraseDigit();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [selected, isPending, addDigit, eraseDigit, submit]);

  if (session.data || session.isPending || users.isPending)
    return (
      <p role="status" className="p-6 text-center">
        Cargando usuarios...
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
  const message = loginErrorMessage(error);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-5 py-8">
      <p className="text-center text-sm font-semibold tracking-wide text-muted">Sistema Pollería</p>
      <h1 className="text-center text-3xl font-bold">
        {selected ? `Hola, ${selected.displayName}` : '¿Quién eres?'}
      </h1>
      {selected ? (
        <>
          <p aria-live="polite" className="min-h-8 text-center text-xl">
            {pin ? '•'.repeat(pin.length) : 'PIN de 4 a 6 dígitos'}
          </p>
          {message && (
            <p role="alert" className="text-center text-danger">
              {message}
            </p>
          )}
          <div className="grid grid-cols-3 gap-3" aria-label="Teclado de PIN">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <Button
                key={digit}
                variant="secondary"
                className="min-h-14 w-full text-xl"
                isDisabled={isPending}
                onPress={() => {
                  addDigit(digit);
                }}
              >{`${digit} `}</Button>
            ))}
            <Button
              variant="secondary"
              className="min-h-14 w-full"
              isDisabled={isPending}
              onPress={eraseDigit}
            >
              Borrar
            </Button>
            <Button
              variant="secondary"
              className="min-h-14 w-full text-xl"
              isDisabled={isPending}
              onPress={() => {
                addDigit('0');
              }}
            >
              {'0 '}
            </Button>
            <Button
              className="min-h-14 w-full min-w-0 px-2 text-sm"
              isDisabled={pin.length < PIN_MIN_LENGTH || isPending}
              onPress={submit}
            >
              {isPending ? 'Entrando...' : 'Entrar'}
            </Button>
          </div>
          <Button
            variant="secondary"
            className="min-h-12 w-full"
            isDisabled={isPending}
            onPress={() => {
              setChosenUsername(null);
              setPin('');
              reset();
            }}
          >
            Cambiar usuario
          </Button>
        </>
      ) : users.data?.length ? (
        <div className="flex flex-col gap-3">
          {users.data.map((user) => (
            <Button
              key={user.username}
              variant="secondary"
              className="min-h-20 w-full min-w-0 flex-col gap-1 py-3"
              onPress={() => {
                setChosenUsername(user.username);
                setPin('');
                reset();
              }}
            >
              <span className="w-full text-xl font-semibold wrap-anywhere whitespace-normal">
                {user.displayName}
              </span>
              <span className="w-full text-sm text-muted wrap-anywhere whitespace-normal">
                {user.username}
              </span>
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-center">
          No hay usuarios activos. El administrador debe crear el primero con el comando pnpm
          users:create-admin.
        </p>
      )}
    </main>
  );
}
