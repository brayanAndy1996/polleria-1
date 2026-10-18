'use client';

import { RoleGuard } from '../../../components/auth/role-guard.tsx';
import { InventoryAdmin } from '../../../components/inventory/inventory-admin.tsx';
import { usePrimaryInstance } from '../../../lib/primary-instance.ts';

export default function Page() {
  const primary = usePrimaryInstance();
  return <RoleGuard area="/admin">{primary ? <InventoryAdmin /> : null}</RoleGuard>;
}
