import { RoleGuard } from '../../../../../components/auth/role-guard.tsx';
import { OrderBill } from '../../../../../components/payments/order-bill.tsx';

export default async function Page({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return (
    <RoleGuard area="/mozo">
      <OrderBill orderId={Number(orderId)} />
    </RoleGuard>
  );
}
