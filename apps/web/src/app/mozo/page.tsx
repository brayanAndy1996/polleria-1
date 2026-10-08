import { RoleGuard } from '../../components/auth/role-guard.tsx';

export default function Page() {
  return (
    <RoleGuard area="/mozo">
      <h1 className="text-3xl font-bold">Mozo</h1>
      <p>Aquí verás las mesas y tomarás los pedidos.</p>
    </RoleGuard>
  );
}
