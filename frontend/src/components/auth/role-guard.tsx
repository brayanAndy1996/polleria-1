'use client';

import { Button } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { hasAnyRole } from '@polleria/shared';
import type { AuthUser } from '@polleria/shared';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
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
import posStyles from './role-guard.module.css';

const DESKTOP_QUERY = '(min-width: 1024px)';
const ADMIN_LINKS = [
  { href: '/admin/carta', label: 'Carta' },
  { href: '/admin/mesas', label: 'Configurar mesas' },
  { href: '/admin/usuarios', label: 'Usuarios' },
] as const;

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
  appearance = 'default',
}: {
  user: AuthUser;
  canChangeArea?: boolean;
  appearance?: 'default' | 'pos';
}) {
  return (
    <header
      className={appearance === 'pos' ? `session-header ${posStyles.posSession}` : 'session-header'}
    >
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
      className={posStyles.areaIcon}
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

function Brand() {
  return (
    <Link href="/" className={posStyles.brand}>
      <span className={posStyles.brandMark} aria-hidden="true">
        P
      </span>
      <strong>Sistema Pollería</strong>
    </Link>
  );
}

function isPathWithin(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function AreaLinks({
  areas,
  pathname,
  onNavigate,
}: {
  areas: AreaPath[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Navegación principal" className={posStyles.primaryNavigation}>
      {areas.map((path) => {
        const active = isPathWithin(pathname, path);
        const current = active ? (pathname === path ? 'page' : 'location') : undefined;
        return (
          <Link
            key={path}
            href={path}
            aria-current={current}
            onClick={onNavigate}
            className={posStyles.navigationLink}
          >
            <AreaIcon area={path} />
            <span>{path === '/mozo' ? 'Mesas' : AREA_LABELS[path]}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function AdminLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Administración" className={posStyles.adminNavigation}>
      {ADMIN_LINKS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={isPathWithin(pathname, href) ? 'page' : undefined}
          onClick={onNavigate}
          className={posStyles.adminLink}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

function subscribeDesktopLayout(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {};
  const media = window.matchMedia(DESKTOP_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function getDesktopLayoutSnapshot() {
  return typeof window.matchMedia !== 'function' || window.matchMedia(DESKTOP_QUERY).matches;
}

function useDesktopLayout() {
  return useSyncExternalStore(subscribeDesktopLayout, getDesktopLayoutSnapshot, () => false);
}

export function RoleGuard({
  area,
  children,
  appearance = 'default',
}: {
  area: AreaPath;
  children: ReactNode;
  appearance?: 'default' | 'pos';
}) {
  const session = useSessionQuery();
  const router = useRouter();
  const pathname = usePathname() ?? `/${area.slice(1)}`;
  const isDesktop = useDesktopLayout();
  const [drawerState, setDrawerState] = useState({ open: false, sessionVersion: 0 });
  const drawerOpen = drawerState.open && drawerState.sessionVersion === session.dataUpdatedAt;
  const setDrawerOpen = useCallback(
    (open: boolean) => setDrawerState({ open, sessionVersion: session.dataUpdatedAt }),
    [session.dataUpdatedAt],
  );
  const shellRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasDrawerOpen = useRef(false);
  const restoreFocus = useRef(true);
  const drawerOpenRef = useRef(drawerOpen);
  const previousPathname = useRef(pathname);
  const allowed = !!session.data && hasAnyRole(session.data.user.roles, AREA_ALLOWED_ROLES[area]);
  const sessionAvailable = !session.isPending && !session.isError && !!session.data && allowed;
  const areas = session.data ? getAllowedAreas(session.data.user.roles) : [];
  useEffect(() => {
    if (!session.data || session.isError) return;
    if (allowed) saveLastArea(area);
    else router.replace(resolveLandingPath(session.data.user.roles, readLastArea()));
  }, [session.data, session.isError, allowed, area, router]);
  useEffect(() => {
    drawerOpenRef.current = drawerOpen;
  }, [drawerOpen]);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(DESKTOP_QUERY);
    const closeOnDesktop = () => {
      if (media.matches) {
        restoreFocus.current = false;
        setDrawerOpen(false);
      }
    };
    media.addEventListener('change', closeOnDesktop);
    return () => media.removeEventListener('change', closeOnDesktop);
  }, [setDrawerOpen]);
  useEffect(() => {
    if (!sessionAvailable || !drawerOpen || isDesktop) {
      if (wasDrawerOpen.current) {
        wasDrawerOpen.current = false;
        if (restoreFocus.current) triggerRef.current?.focus();
        restoreFocus.current = true;
      }
      return;
    }

    wasDrawerOpen.current = true;
    const shell = shellRef.current;
    const previousOverflow = document.body.style.overflow;
    if (shell) shell.inert = true;
    document.body.style.overflow = 'hidden';
    drawerRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        restoreFocus.current = true;
        setDrawerOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const drawer = drawerRef.current;
      if (!drawer) return;
      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('hidden'));
      if (focusable.length === 0) {
        event.preventDefault();
        drawer.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (
        event.shiftKey &&
        (document.activeElement === drawer ||
          document.activeElement === first ||
          !drawer.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !drawer.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (shell) shell.inert = false;
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen, isDesktop, sessionAvailable, setDrawerOpen]);
  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    if (!drawerOpenRef.current) return;
    restoreFocus.current = false;
    setDrawerOpen(false);
  }, [pathname, setDrawerOpen]);
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
      <div
        className={`${posStyles.authRoot}${appearance === 'pos' ? ` ${posStyles.posShell}` : ''}`}
      >
        <div ref={shellRef} className={`app-shell ${posStyles.appLayout}`}>
          <SkipLink />
          {isDesktop ? (
            <aside className={posStyles.sidebar}>
              <Brand />
              <AreaLinks areas={areas} pathname={pathname} />
              {areas.includes('/admin') && <AdminLinks pathname={pathname} />}
              <div className={posStyles.sidebarFooter}>
                <SessionHeader
                  user={session.data.user}
                  canChangeArea={areas.length > 1}
                  appearance={appearance}
                />
              </div>
            </aside>
          ) : (
            <header className={posStyles.mobileTopbar}>
              <Brand />
              <button
                ref={triggerRef}
                type="button"
                className={posStyles.openNavigation}
                aria-label="Abrir navegación"
                aria-expanded={drawerOpen}
                aria-controls="authenticated-navigation"
                onClick={() => {
                  restoreFocus.current = true;
                  setDrawerOpen(true);
                }}
              >
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
                  <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" />
                </svg>
              </button>
            </header>
          )}
          <main
            id="main-content"
            tabIndex={-1}
            className={`workspace-main workspace-${area.slice(1)}${appearance === 'pos' ? ` ${posStyles.posWorkspace}` : ''}`}
          >
            {children}
          </main>
        </div>
        {!isDesktop && drawerOpen && (
          <div className={posStyles.drawerBackdrop}>
            <div
              ref={drawerRef}
              id="authenticated-navigation"
              role="dialog"
              aria-modal="true"
              aria-labelledby="authenticated-navigation-title"
              tabIndex={-1}
              className={posStyles.drawer}
            >
              <div className={posStyles.drawerHeading}>
                <h2 id="authenticated-navigation-title">Navegación</h2>
                <button
                  type="button"
                  className={posStyles.closeNavigation}
                  aria-label="Cerrar navegación"
                  onClick={() => {
                    restoreFocus.current = true;
                    setDrawerOpen(false);
                  }}
                >
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
                    <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </button>
              </div>
              <Brand />
              <AreaLinks
                areas={areas}
                pathname={pathname}
                onNavigate={() => {
                  restoreFocus.current = false;
                  setDrawerOpen(false);
                }}
              />
              {areas.includes('/admin') && (
                <AdminLinks
                  pathname={pathname}
                  onNavigate={() => {
                    restoreFocus.current = false;
                    setDrawerOpen(false);
                  }}
                />
              )}
              <div className={posStyles.drawerFooter}>
                <SessionHeader
                  user={session.data.user}
                  canChangeArea={areas.length > 1}
                  appearance={appearance}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
