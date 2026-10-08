import { RoleGuard } from '../../components/auth/role-guard.tsx';

export default function Page() {
  return (
    <RoleGuard area="/cocina">
      <h1 className="text-3xl font-bold">Cocina</h1>
      <p>Las comandas salen en la impresora de cocina. Esta pantalla todavía no tiene funciones.</p>
    </RoleGuard>
  );
}
