import type { ReactNode } from 'react';
import { SkipLink } from './skip-link.tsx';

export function ScreenState({ children }: { children: ReactNode }) {
  return (
    <>
      <SkipLink />
      <main id="main-content" tabIndex={-1} className="public-screen">
        <div className="public-panel screen-state">{children}</div>
      </main>
    </>
  );
}
