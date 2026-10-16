import { RoleGuard } from '../../../../components/auth/role-guard.tsx';
import { CashierOrderDetail } from '../../../../components/payments/cashier-order-detail.tsx';

export default async function Page({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return (
    <RoleGuard area="/caja">
      <CashierOrderDetail orderId={Number(orderId)} />
    </RoleGuard>
  );
}
