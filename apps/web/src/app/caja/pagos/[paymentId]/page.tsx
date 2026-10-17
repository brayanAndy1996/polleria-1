import { RoleGuard } from '../../../../components/auth/role-guard.tsx';
import { PaymentDetail } from '../../../../components/payments/payment-detail.tsx';

export default async function Page({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  return (
    <RoleGuard area="/caja">
      <PaymentDetail paymentId={Number(paymentId)} />
    </RoleGuard>
  );
}
