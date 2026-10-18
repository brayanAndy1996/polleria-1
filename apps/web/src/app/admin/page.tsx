import Link from 'next/link';
import { RoleGuard } from '../../components/auth/role-guard.tsx';

export default function Page() {
  return (
    <RoleGuard area="/admin">
      <h1 className="text-3xl font-bold">Administración</h1>
      <p>Configura el equipo, la carta y el salón de atención.</p>
      <nav aria-label="Secciones de administración" className="admin-links">
        <Link href="/admin/usuarios" className="admin-link">
          Usuarios
        </Link>
        <Link href="/admin/carta" className="admin-link">
          Carta
        </Link>
        <Link href="/admin/mesas" className="admin-link">
          Mesas
        </Link>
        <Link href="/admin/inventario" className="admin-link">
          Inventario
        </Link>
        <Link href="/admin/reportes" className="admin-link">
          Reportes
        </Link>
      </nav>
    </RoleGuard>
  );
}
