'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { useState } from 'react';
import type { ReactNode } from 'react';

/** Proveedores globales de consultas y preferencias de movimiento. */
export function Providers({ children }: { children: ReactNode }) {
  // useState con función: el QueryClient se crea una sola vez por navegador (y una vez por
  // solicitud en el servidor), no en cada render.
  const [queryClient] = useState(() => new QueryClient());

  return (
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MotionConfig>
  );
}
