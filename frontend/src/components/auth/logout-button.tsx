'use client';

import { Button } from '@heroui/react';
import { useMutation } from '@tanstack/react-query';
import { useRef } from 'react';
import { logout } from '../../lib/api/auth.ts';
import { hardNavigate } from '../../lib/navigation.ts';

export function LogoutButton() {
  const sending = useRef(false);
  const { mutate, isPending, isError } = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      hardNavigate('/login');
    },
    onSettled: () => {
      sending.current = false;
    },
  });
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        className="min-h-12"
        isDisabled={isPending}
        onPress={() => {
          if (sending.current) return;
          sending.current = true;
          mutate();
        }}
      >
        {isPending ? 'Cerrando sesión...' : 'Cerrar sesión'}
      </Button>
      {isError && (
        <p role="alert" className="text-sm text-danger">
          No se pudo cerrar la sesión. Intenta de nuevo.
        </p>
      )}
    </div>
  );
}
