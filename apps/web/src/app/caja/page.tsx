import { RoleGuard } from '../../components/auth/role-guard.tsx';
import { CashierPrintAttention } from '../../components/kitchen-ticket-prints/kitchen-ticket-print-sections.tsx';

export default function Page() {
  return (
    <RoleGuard area="/caja">
      <h1 className="text-3xl font-bold">Caja</h1>
      <p>Aquí cobrarás las cuentas.</p>
      <CashierPrintAttention />
    </RoleGuard>
  );
}
