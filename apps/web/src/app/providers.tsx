'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';

/** Proveedores globales de la web. Hoy solo TanStack Query. */
export function Providers({ children }: { children: ReactNode }) {
  // useState con función: el QueryClient se crea una sola vez por navegador (y una vez por
  // solicitud en el servidor), no en cada render.
  const [queryClient] = useState(() => new QueryClient());

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
