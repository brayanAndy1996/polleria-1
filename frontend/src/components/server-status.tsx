'use client';

import { Chip } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { getServerStatus } from '../lib/api/health.ts';
import type { ServerConnectionStatus } from '../lib/api/health.ts';

/** Cada cuánto vuelve a preguntar el estado (spec 001, S-10). */
const REFETCH_INTERVAL_MS = 10_000;

type StatusView = { label: string; color: 'default' | 'success' | 'warning' | 'danger' };

// El color nunca es la única señal: cada estado lleva su texto.
const STATUS_VIEWS = {
  loading: { label: 'Verificando conexión...', color: 'default' },
  connected: { label: 'Conectado', color: 'success' },
  databaseDown: { label: 'Sin conexión con la base de datos', color: 'warning' },
  unreachable: { label: 'Sin conexión con el servidor', color: 'danger' },
} satisfies Record<'loading' | ServerConnectionStatus, StatusView>;

/** Indicador de si la web llega a la API y la API a la base de datos. */
export function ServerStatus() {
  // getServerStatus nunca lanza, así que la consulta siempre termina con un estado. La consulta
  // periódica hace de reintento, por eso retry es false. Mientras se repite la consulta se
  // conserva el último estado: 'Verificando conexión...' solo aparece en la primera carga.
  const { data } = useQuery({
    queryKey: ['health'],
    queryFn: () => getServerStatus(),
    refetchInterval: REFETCH_INTERVAL_MS,
    retry: false,
  });

  const view = STATUS_VIEWS[data ?? 'loading'];

  return (
    <Chip
      role="status"
      aria-live="polite"
      color={view.color}
      variant="soft"
      size="lg"
      className="max-w-full justify-center px-4 py-2 text-center text-lg leading-snug whitespace-normal"
    >
      {view.label}
    </Chip>
  );
}
