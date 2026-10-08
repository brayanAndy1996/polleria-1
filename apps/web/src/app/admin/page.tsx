import Link from 'next/link';
import { RoleGuard } from '../../components/auth/role-guard.tsx';

export default function Page() {
  return (
    <RoleGuard area="/admin">
      <h1 className="text-3xl font-bold">Administración</h1>
      <p>Aquí gestionarás los usuarios, la carta y los reportes.</p>
      <nav aria-label="Administración" className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/admin/usuarios"
          className="flex min-h-16 items-center justify-center rounded-2xl border border-separator bg-surface px-5 py-4 text-xl font-semibold transition-colors hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          Usuarios
        </Link>
      </nav>
    </RoleGuard>
  );
}
