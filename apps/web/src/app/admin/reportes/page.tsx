'use client';

import { RoleGuard } from '../../../components/auth/role-guard.tsx';
import { DailySalesReportView } from '../../../components/reports/daily-sales-report.tsx';

export default function Page() {
  return (
    <RoleGuard area="/admin">
      <DailySalesReportView />
    </RoleGuard>
  );
}
