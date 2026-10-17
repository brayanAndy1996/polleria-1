import { RoleGuard } from '../../components/auth/role-guard.tsx';
import { CashierOrders } from '../../components/payments/cashier-orders.tsx';
import { CashierPrintAttention } from '../../components/kitchen-ticket-prints/kitchen-ticket-print-sections.tsx';

export default function Page() {
  return (
    <RoleGuard area="/caja">
      <h1 className="text-3xl font-bold">Caja</h1>
      <CashierOrders />
      <CashierPrintAttention />
    </RoleGuard>
  );
}
