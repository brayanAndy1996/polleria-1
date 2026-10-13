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
  AREA_LABELS,
  AREA_ALLOWED_ROLES,
  formatRoleLabels,
  getAllowedAreas,
  resolveLandingPath,
} from '../../lib/auth/roles.ts';
import type { AreaPath } from '../../lib/auth/roles.ts';
import { LogoutButton } from './logout-button.tsx';
import { SkipLink } from './skip-link.tsx';
import { ScreenState } from './screen-state.tsx';

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
      <ScreenState>
        <p role="status" className="p-6 text-center">
          Cargando...
        </p>
      </ScreenState>
    );
  if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') return null;
  if (error)
    return (
      <ScreenState>
        <div className="space-y-4 p-6 text-center">
          <p role="alert">No se pudo verificar tu sesión.</p>
          <Button className="min-h-12" onPress={retry}>
            Reintentar
          </Button>
        </div>
      </ScreenState>
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
    <header className="session-header">
      <p className="session-name">
        {user.displayName} · {formatRoleLabels(user.roles)}
      </p>
      <div className="session-actions">
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

function AreaIcon({ area }: { area: AreaPath }) {
  return (
    <svg
      className="area-glyph"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {area === '/mozo' && (
        <>
          <path d="M5 8h14v8H5zM3 19h18M8 16v3m8-3v3" />
          <path d="M3 5h2m14 0h2" />
        </>
      )}
      {area === '/caja' && (
        <>
          <path d="M4 5h16v14H4zM4 10h16M7 7h.01M10 7h.01M7 14h4m2 0h4M7 17h10" />
        </>
      )}
      {area === '/cocina' && (
        <>
          <path d="M5 10h14v8H5zM3 20h18M8 10V7h8v3m-4-3V4" />
          <path d="M8 3V2m8 1V2" />
        </>
      )}
      {area === '/admin' && (
        <>
          <path d="M4 6h16M4 12h16M4 18h16" />
          <circle cx="9" cy="6" r="2" />
          <circle cx="15" cy="12" r="2" />
          <circle cx="8" cy="18" r="2" />
        </>
      )}
    </svg>
  );
}

export function RoleGuard({ area, children }: { area: AreaPath; children: ReactNode }) {
  const session = useSessionQuery();
  const router = useRouter();
  const allowed = !!session.data && hasAnyRole(session.data.user.roles, AREA_ALLOWED_ROLES[area]);
  const areas = session.data ? getAllowedAreas(session.data.user.roles) : [];
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
      <ScreenState>
        <p role="status" className="p-6 text-center">
          Cargando...
        </p>
      </ScreenState>
    );
  return (
    <>
      <SkipLink />
      <div className="app-shell">
        <aside className="app-sidebar" aria-label="Panel de trabajo">
          <a href="/" className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 40 40">
                <path d="M20 4 34 12v16L20 36 6 28V12L20 4Z" />
                <path d="M13 25c1.5-5.5 4-9 7-11 3 2 5.5 5.5 7 11M15 27h10" />
              </svg>
            </span>
            <span>
              <strong>Sistema Pollería</strong>
              <small>Salón y operación</small>
            </span>
          </a>
          <p className="nav-caption">Áreas de trabajo</p>
          <nav aria-label="Navegación de áreas" className="area-navigation">
            {areas.map((path) => (
              <Link key={path} href={path} aria-current={area === path ? 'page' : undefined}>
                <AreaIcon area={path} />
                <span>{AREA_LABELS[path]}</span>
              </Link>
            ))}
          </nav>
        </aside>
        <div className="app-workspace">
          <header className="workspace-header">
            <SessionHeader user={session.data.user} canChangeArea={areas.length > 1} />
          </header>
          <main
            id="main-content"
            tabIndex={-1}
            className={`workspace-main workspace-${area.slice(1)}`}
          >
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
