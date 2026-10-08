'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AREA_LABELS, getAllowedAreas } from '../../lib/auth/roles.ts';
import { SessionHeader, SessionStatus, useSessionQuery } from './role-guard.tsx';

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
      <p role="status" className="p-6 text-center">
        Cargando...
      </p>
    );
  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-5 py-6">
      <SessionHeader user={session.data.user} />
      <h1 className="text-3xl font-bold">¿Dónde vas a trabajar?</h1>
      <nav aria-label="Áreas" className="grid gap-4 sm:grid-cols-2">
        {areas.map((area) => (
          <Link
            key={area}
            href={area}
            className="flex min-h-16 items-center justify-center rounded-2xl border border-separator bg-surface px-5 py-4 text-xl font-semibold transition-colors hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            {AREA_LABELS[area]}
          </Link>
        ))}
      </nav>
    </main>
  );
}
