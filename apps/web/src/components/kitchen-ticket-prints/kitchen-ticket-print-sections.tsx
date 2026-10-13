'use client';

import { Button, Input } from '@heroui/react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { KitchenTicketPrintView } from '@polleria/shared';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/api/client.ts';
import { apiErrorMessage } from '../../lib/api/error-message.ts';
import { createIdempotencyKey } from '../../lib/idempotency.ts';
import { useSessionQuery } from '../auth/role-guard.tsx';
import {
  listKitchenTicketPrintAttention,
  listOrderTicketPrints,
  reprintKitchenTicket,
} from '../../lib/api/kitchen-ticket-prints.ts';

const PRINT_QUERY = ['kitchen-ticket-prints'] as const;
const KINDS: Record<KitchenTicketPrintView['kind'], string> = {
  initial: 'Inicial',
  additional: 'Adicional',
  void: 'Anulado',
};
const STATUSES: Record<KitchenTicketPrintView['status'], string> = {
  queued: 'En espera',
  printing: 'Generando archivo…',
  succeeded: 'Archivo generado',
  failed: 'No se pudo generar la comanda',
  uncertain: 'Revisar salida',
  not_tracked: 'Anterior a esta función',
};

function shouldReprint(print: KitchenTicketPrintView, mode: 'attention' | 'order') {
  if (!print.canReprint) return false;
  return mode === 'order'
    ? print.status !== 'not_tracked'
    : print.status === 'failed' || print.status === 'uncertain';
}

function PrintRow({
  print,
  mode,
  isWaiter,
  isAdmin = false,
}: {
  print: KitchenTicketPrintView;
  mode: 'attention' | 'order';
  isWaiter: boolean;
  isAdmin?: boolean;
}) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState<string>();
  const [requestError, setRequestError] = useState<string>();
  const [lostRequest, setLostRequest] = useState<{ key: string; reason: string } | null>(null);
  const [acceptedCopyNumber, setAcceptedCopyNumber] = useState<number | null>(null);
  const pending = useRef(false);
  const request = useMutation({
    mutationFn: (input: { key: string; reason: string }) =>
      reprintKitchenTicket(print.ticketId, input.key, input.reason),
    onSuccess: ({ attempt }) => {
      setLostRequest(null);
      setAcceptedCopyNumber(attempt.copyNumber);
      setRequestError(undefined);
      setDialogOpen(false);
      setReason('');
      // Mantiene visible el 202 como En espera mientras se relee el recurso.
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: PRINT_QUERY }), 250);
    },
    onError: (error) => {
      const networkLost = error instanceof ApiError && error.code === 'NETWORK_ERROR';
      setRequestError(
        networkLost
          ? 'No se recibió respuesta. Puedes reintentar la solicitud.'
          : apiErrorMessage(error),
      );
      if (!networkLost) setLostRequest(null);
    },
    onSettled: () => {
      pending.current = false;
    },
  });
  const startRequest = (retry: boolean) => {
    if (pending.current || request.isPending) return;
    const bodyReason = retry ? lostRequest?.reason : reason.trim();
    if (bodyReason === undefined || bodyReason.length === 0) {
      setLocalError('Indica el motivo de la copia.');
      return;
    }
    const attempt =
      retry && lostRequest !== null
        ? lostRequest
        : { key: createIdempotencyKey(), reason: bodyReason };
    pending.current = true;
    setLocalError(undefined);
    setRequestError(undefined);
    setLostRequest(attempt);
    request.mutate(attempt);
  };
  const canCopy =
    shouldReprint(print, mode) &&
    (mode === 'order' ? (isWaiter || isAdmin) && (print.kind !== 'void' || isAdmin) : true);
  const location = print.tablesAtIssue.map((table) => table.name).join(', ');
  const acceptancePending =
    acceptedCopyNumber !== null && (print.lastAttempt?.copyNumber ?? -1) < acceptedCopyNumber;
  const visibleStatus = acceptancePending ? 'En espera' : STATUSES[print.status];

  return (
    <li className="space-y-2 rounded-2xl border border-separator bg-surface px-4 py-3">
      <p className="font-semibold">
        Comanda {print.ticketId} · {KINDS[print.kind]}
      </p>
      {location && <p>{location}</p>}
      <p>
        {print.kind === 'void' && print.status === 'failed'
          ? 'No se pudo generar la comanda'
          : visibleStatus}
      </p>
      {canCopy && (
        <Button
          className="min-h-12"
          onPress={() => {
            setDialogOpen(true);
            setLostRequest(null);
            setRequestError(undefined);
            setReason('');
          }}
        >
          Solicitar copia
        </Button>
      )}
      {requestError && <p role="alert">{requestError}</p>}
      {dialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`copy-title-${print.ticketId}`}
          className="space-y-4 rounded-2xl border border-separator bg-surface px-4 py-4"
        >
          <h3 id={`copy-title-${print.ticketId}`} className="text-lg font-semibold">
            Solicitar copia de comanda {print.ticketId}
          </h3>
          <p>
            {KINDS[print.kind]} · {location || 'Mesa sin referencia'}
          </p>
          <p>La salida anterior puede existir. La copia llevará REIMPRESIÓN.</p>
          <Input
            aria-label="Motivo de la copia"
            value={reason}
            fullWidth
            disabled={request.isPending || lostRequest !== null}
            onChange={(event) => setReason(event.target.value)}
          />
          {localError && <p role="alert">{localError}</p>}
          <div className="flex flex-wrap gap-3">
            {lostRequest !== null ? (
              <Button
                className="min-h-12"
                isDisabled={request.isPending}
                onPress={() => startRequest(true)}
              >
                {request.isPending ? 'Solicitando…' : 'Reintentar solicitud'}
              </Button>
            ) : (
              <Button
                className="min-h-12"
                isDisabled={request.isPending}
                onPress={() => startRequest(false)}
              >
                {request.isPending ? 'Solicitando…' : 'Sí, generar copia'}
              </Button>
            )}
            <Button
              className="min-h-12"
              isDisabled={request.isPending}
              onPress={() => setDialogOpen(false)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function AttentionSection({ isWaiter }: { isWaiter: boolean }) {
  const session = useSessionQuery();
  const isAdmin = session.data?.user.roles.includes('admin') ?? false;
  const [pageCursors, setPageCursors] = useState<number[]>([]);
  const query = useQuery({
    queryKey: [...PRINT_QUERY, 'attention', 0],
    queryFn: () => listKitchenTicketPrintAttention(),
    retry: false,
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const extraPages = useQueries({
    queries: pageCursors.map((afterTicketId) => ({
      queryKey: [...PRINT_QUERY, 'attention', afterTicketId],
      queryFn: () => listKitchenTicketPrintAttention(afterTicketId),
      retry: false,
      refetchInterval: 5000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    })),
  });
  const refetchFirstAttention = query.refetch;
  useEffect(() => {
    const refreshWhenVisible = () => {
      if (!document.hidden && document.visibilityState === 'visible') {
        void refetchFirstAttention();
        for (const page of extraPages) void page.refetch();
      }
    };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [refetchFirstAttention, extraPages]);
  const nextAfterTicketId = query.data?.nextAfterTicketId ?? null;
  if (query.isPending)
    return (
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Comandas por revisar</h2>
        <p role="status">Cargando estado de comandas…</p>
      </section>
    );
  const pages = [query.data, ...extraPages.map((page) => page.data)].filter(
    (page): page is NonNullable<typeof page> => page !== undefined,
  );
  const all = [
    ...new Map(
      pages.flatMap((page) => page.prints).map((print) => [print.ticketId, print]),
    ).values(),
  ];
  const lastExtraPage = extraPages.at(-1);
  const cursor =
    pageCursors.length > 0 && lastExtraPage?.data !== undefined
      ? lastExtraPage.data.nextAfterTicketId
      : nextAfterTicketId;
  const loadingMore = lastExtraPage?.isPending ?? false;
  const pageError = extraPages.some((page) => page.isError);
  const hasError = query.isError || pageError;
  return (
    <section className="space-y-3" aria-labelledby="attention-heading">
      <h2 id="attention-heading" className="text-xl font-semibold">
        Comandas por revisar
      </h2>
      {hasError && <p role="alert">No se pudo consultar la generación de comandas.</p>}
      {all.length === 0 && !hasError && <p>No hay comandas por revisar.</p>}
      {all.length > 0 && (
        <ul className="space-y-3">
          {all.map((print) => (
            <PrintRow
              key={print.ticketId}
              print={print}
              mode="attention"
              isWaiter={isWaiter}
              isAdmin={isAdmin}
            />
          ))}
        </ul>
      )}
      {cursor !== null && cursor !== undefined && (
        <Button
          className="min-h-12"
          isDisabled={loadingMore}
          onPress={() =>
            setPageCursors((current) => (current.includes(cursor) ? current : [...current, cursor]))
          }
        >
          {loadingMore ? 'Cargando…' : 'Cargar más'}
        </Button>
      )}
      {hasError && (
        <Button
          className="min-h-12"
          onPress={() => {
            void refetchFirstAttention();
            for (const page of extraPages) void page.refetch();
          }}
        >
          Reintentar
        </Button>
      )}
      {hasError && all.length > 0 && (
        <p className="text-sm text-muted">Se conserva la información consultada anteriormente.</p>
      )}
    </section>
  );
}

export function WaiterPrintAttention() {
  return <AttentionSection isWaiter />;
}

export function CashierPrintAttention() {
  return <AttentionSection isWaiter={false} />;
}

export function OrderTicketPrints({
  orderId,
  isWaiter,
  isAdmin,
}: {
  orderId: number;
  isWaiter: boolean;
  isAdmin: boolean;
}) {
  const query = useQuery({
    queryKey: [...PRINT_QUERY, 'order', orderId],
    queryFn: () => listOrderTicketPrints(orderId),
    retry: false,
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  return (
    <section className="space-y-3" aria-labelledby="order-print-heading">
      <h2 id="order-print-heading" className="text-xl font-semibold">
        Estado de generación de comandas
      </h2>
      {query.isPending && <p role="status">Cargando estado de comandas…</p>}
      {query.isError && (
        <>
          <p role="alert">No se pudo consultar la generación de comandas.</p>
          <Button
            className="min-h-12"
            onPress={() => {
              void query.refetch();
            }}
          >
            Reintentar
          </Button>
          {query.data && (
            <p className="text-sm text-muted">
              Se conserva la información consultada anteriormente.
            </p>
          )}
        </>
      )}
      {query.data?.prints.length === 0 && <p>No hay comandas registradas para este pedido.</p>}
      {query.data && query.data.prints.length > 0 && (
        <ul className="space-y-3">
          {query.data.prints.map((print) => (
            <PrintRow
              key={print.ticketId}
              print={print}
              mode="order"
              isWaiter={isWaiter}
              isAdmin={isAdmin}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
