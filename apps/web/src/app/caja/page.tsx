import { RoleGuard } from '../../components/auth/role-guard.tsx';

export default function Page() {
  return (
    <RoleGuard area="/caja">
      <h1 className="text-3xl font-bold">Caja</h1>
      <p>Aquí cobrarás las cuentas.</p>
    </RoleGuard>
  );
}
