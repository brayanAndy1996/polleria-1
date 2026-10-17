'use client';

import { Button } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { RoleGuard, useSessionQuery } from '../../../components/auth/role-guard.tsx';
import { getUsers } from '../../../lib/api/users.ts';
import { formatRoleLabels } from '../../../lib/auth/roles.ts';

function UsersList() {
  const session = useSessionQuery();
  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: getUsers, retry: false });
  if (users.isPending)
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
  const selfId = session.data?.user.id;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Usuarios</h1>
        <Link
          href="/admin/usuarios/nuevo"
          className="inline-flex min-h-12 items-center rounded-xl bg-accent px-5 font-semibold text-accent-foreground"
        >
          Agregar usuario
        </Link>
      </div>
      <ul className="space-y-3">
        {(users.data ?? []).map((user) => (
          <li
            key={user.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-separator bg-surface px-5 py-4"
          >
            <div className="min-w-0 space-y-1">
              <p className="text-xl font-semibold wrap-anywhere">{user.displayName}</p>
              <p className="text-sm text-muted wrap-anywhere">{user.username}</p>
              <p className="text-sm">{formatRoleLabels(user.roles)}</p>
              {!user.isActive && <p className="text-sm font-semibold text-danger">Desactivado</p>}
              {user.id === selfId && <p className="text-sm text-muted">(tú)</p>}
            </div>
            <Link
              href={`/admin/usuarios/${user.id}`}
              className="inline-flex min-h-12 items-center text-accent underline underline-offset-4"
            >
              Editar
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function Page() {
  return (
    <RoleGuard area="/admin">
      <UsersList />
    </RoleGuard>
  );
}
