import { RoleGuard } from '../../components/auth/role-guard.tsx';

export default function Page() {
  return (
    <RoleGuard area="/admin">
      <h1 className="text-3xl font-bold">Administración</h1>
      <p>Aquí gestionarás los usuarios, la carta y los reportes.</p>
    </RoleGuard>
  );
}
