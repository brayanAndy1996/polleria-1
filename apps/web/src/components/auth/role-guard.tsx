'use client';

import { Button } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { hasAnyRole } from '@polleria/shared';
import type { AuthUser } from '@polleria/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { getSession } from '../../lib/api/auth.ts';
import { ApiError } from '../../lib/api/client.ts';
import { readLastArea, saveLastArea } from '../../lib/auth/last-area.ts';
import {
  AREA_ALLOWED_ROLES,
  formatRoleLabels,
  getAllowedAreas,
  resolveLandingPath,
} from '../../lib/auth/roles.ts';
import type { AreaPath } from '../../lib/auth/roles.ts';
import { LogoutButton } from './logout-button.tsx';

export function useSessionQuery() {
  return useQuery({ queryKey: ['auth', 'me'], queryFn: () => getSession(), retry: false });
}
export function SessionStatus({
  pending,
  error,
  retry,
}: {
  pending: boolean;
  error: Error | null;
  retry: () => void;
}) {
  if (pending)
    return (
      <p role="status" className="p-6 text-center">
        Cargando...
      </p>
    );
  if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') return null;
  if (error)
    return (
      <div className="space-y-4 p-6 text-center">
        <p role="alert">No se pudo verificar tu sesión.</p>
        <Button className="min-h-12" onPress={retry}>
          Reintentar
        </Button>
      </div>
    );
  return null;
}
export function SessionHeader({
  user,
  canChangeArea = false,
}: {
  user: AuthUser;
  canChangeArea?: boolean;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-separator pb-5">
      <p className="w-full min-w-0 break-words font-semibold sm:w-auto">
        {user.displayName} · {formatRoleLabels(user.roles)}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {canChangeArea && (
          <Link
            href="/areas"
            className="inline-flex min-h-12 items-center text-accent underline underline-offset-4"
          >
            Cambiar de área
          </Link>
        )}
        <LogoutButton />
      </div>
    </header>
  );
}
export function RoleGuard({ area, children }: { area: AreaPath; children: ReactNode }) {
  const session = useSessionQuery();
  const router = useRouter();
  const allowed = !!session.data && hasAnyRole(session.data.user.roles, AREA_ALLOWED_ROLES[area]);
  useEffect(() => {
    if (!session.data || session.isError) return;
    if (allowed) saveLastArea(area);
    else router.replace(resolveLandingPath(session.data.user.roles, readLastArea()));
  }, [session.data, session.isError, allowed, area, router]);
  if (session.isPending || session.isError)
    return (
      <SessionStatus
        pending={session.isPending}
        error={session.error}
        retry={() => {
          void session.refetch();
        }}
      />
    );
  if (!session.data || !allowed)
    return (
      <p role="status" className="p-6 text-center">
        Cargando...
      </p>
    );
  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-5 py-6">
      <SessionHeader
        user={session.data.user}
        canChangeArea={getAllowedAreas(session.data.user.roles).length > 1}
      />
      {children}
    </main>
  );
}
