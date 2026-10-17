import Link from 'next/link';
import { ServerStatus } from '../components/server-status.tsx';
import { SkipLink } from '../components/auth/skip-link.tsx';

export default function Page() {
  return (
    <>
      <SkipLink />
      <main id="main-content" tabIndex={-1} className="public-screen">
        <div className="public-panel">
          <div className="public-brand">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 40 40">
                <path d="M20 4 34 12v16L20 36 6 28V12L20 4Z" />
                <path d="M13 25c1.5-5.5 4-9 7-11 3 2 5.5 5.5 7 11M15 27h10" />
              </svg>
            </span>
            <span>
              <strong>Sistema Pollería</strong>
              <small>Operación de salón</small>
            </span>
          </div>
          <h1>Sistema Pollería</h1>
          <p>El salón, en orden. Ingresa para atender mesas y coordinar los pedidos.</p>
          <ServerStatus />
          <Link href="/login" className="primary-link">
            Iniciar sesión
          </Link>
        </div>
      </main>
    </>
  );
}
