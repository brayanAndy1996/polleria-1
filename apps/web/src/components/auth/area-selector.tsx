'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AREA_LABELS, getAllowedAreas } from '../../lib/auth/roles.ts';
import { SessionHeader, SessionStatus, useSessionQuery } from './role-guard.tsx';
import { SkipLink } from './skip-link.tsx';
import { ScreenState } from './screen-state.tsx';

export function AreaSelector() {
  const session = useSessionQuery();
  const router = useRouter();
  const areas = session.data ? getAllowedAreas(session.data.user.roles) : [];
  const singleArea = areas.length === 1 ? areas[0] : undefined;
  useEffect(() => {
    if (singleArea && !session.isError) router.replace(singleArea);
  }, [singleArea, session.isError, router]);
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
  if (!session.data || singleArea)
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
      <main id="main-content" tabIndex={-1} className="public-screen">
        <div className="public-panel">
          <SessionHeader user={session.data.user} />
          <h1 className="mt-6 mb-5">¿Dónde vas a trabajar?</h1>
          <nav aria-label="Áreas" className="area-picker">
            {areas.map((area) => (
              <Link key={area} href={area} className="area-picker-link">
                {AREA_LABELS[area]}
              </Link>
            ))}
          </nav>
        </div>
      </main>
    </>
  );
}
