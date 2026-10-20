'use client';

import { Button } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { formatSoles } from '@polleria/shared';
import { tableStateSchema } from '@polleria/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Dialog, Modal, ModalOverlay } from 'react-aria-components';
import { useEffect, useRef, useState } from 'react';
import { RoleGuard } from '../../components/auth/role-guard.tsx';
import { ApiError, apiClient, parseResponse } from '../../lib/api/client.ts';
import { apiErrorMessage } from '../../lib/api/error-message.ts';
import { openTableOrder } from '../../lib/api/tables.ts';
import { TABLE_STATE_LABELS } from '../../lib/menu-labels.ts';
import { WaiterPrintAttention } from '../../components/kitchen-ticket-prints/kitchen-ticket-print-sections.tsx';
import { ScreenState } from '../../components/auth/screen-state.tsx';
import { motion } from 'motion/react';
import styles from './page.module.css';

/**
 * Lectura laxa del salón para el tablero (D-011-03): la tarjeta solo necesita el
 * estado del ítem para la marca 'Anulación pedida'; un ítem parcial no debe
 * tumbar el listado completo — se descarta por ítem, no por mesa (ADV-011-10).
 */
const boardItemSchema = z.looseObject({ status: z.string() });
const boardOrderSchema = z.looseObject({
  id: z.number().int().positive(),
  status: z.string(),
  totalCents: z.number().int(),
  openedBy: z.looseObject({ id: z.number().int().positive(), displayName: z.string() }),
  readyAt: z.string().nullable(),
  billRequestedAt: z.string().nullable(),
  tables: z.array(z.looseObject({ id: z.number().int().positive(), name: z.string() })),
  items: z
    .array(z.unknown())
    .transform((items) =>
      items.filter(
        (item): item is z.infer<typeof boardItemSchema> => boardItemSchema.safeParse(item).success,
      ),
    ),
});
const boardTableSchema = z.looseObject({
  id: z.number().int().positive(),
  name: z.string(),
  isActive: z.boolean(),
  state: tableStateSchema,
  order: boardOrderSchema.nullable(),
});
const boardTablesSchema = z.strictObject({ tables: z.array(boardTableSchema) });
type BoardTable = z.infer<typeof boardTableSchema>;

/** GET /tables con el esquema laxo de la tarjeta. */
async function getBoardTables(): Promise<BoardTable[]> {
  const { body, status } = await apiClient.requestWithStatus('/tables');
  return parseResponse(boardTablesSchema, status, body).tables;
}

/**
 * Tarjeta del salón (D-011-03): nombre, etiqueta de estado derivada, mozo y total,
 * 'y Mesa N' por cada mesa unida extra, y las marcas 'Pidió la cuenta' /
 * 'Anulación pedida' cuando la etiqueta no las cubre ya.
 */
function TableCard({
  table,
  onSelect,
}: {
  table: BoardTable;
  onSelect: (id: number, trigger: HTMLAnchorElement) => void;
}) {
  const order = table.order;
  // Solo la mesa principal del pedido (primera en tables) nombra a las unidas;
  // una mesa cuya orden comparte la lista no repite las ajenas (AC-05).
  const coversOrder = order !== null && order.tables[0]?.id === table.id;
  const extraTables = coversOrder ? order.tables.filter((covered) => covered.id !== table.id) : [];
  const billMark =
    order !== null && order.billRequestedAt !== null && table.state !== 'bill_requested';
  const voidMark = order?.items.some((item) => item.status === 'void_requested') ?? false;
  return (
    <motion.li className={styles.card} whileTap={{ scale: 0.985 }} transition={{ duration: 0.12 }}>
      <Link
        href={`/mozo/mesas/${table.id}`}
        onClick={(event) => {
          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            event.currentTarget.target === '_blank' ||
            event.currentTarget.hasAttribute('download')
          )
            return;
          event.preventDefault();
          onSelect(table.id, event.currentTarget);
        }}
      >
        <span className={styles.cardHeading}>
          <span className={styles.name}>{table.name}</span>
          <span className={styles.badge} data-state={table.state}>
            {TABLE_STATE_LABELS[table.state]}
          </span>
        </span>
        <span className={order === null ? styles.available : styles.amount}>
          {order === null ? 'Disponible' : formatSoles(order.totalCents)}
        </span>
        {order !== null && <span className={styles.details}>{order.openedBy.displayName}</span>}
        {extraTables.map((covered) => (
          <span key={covered.id} className={styles.details}>
            y {covered.name}
          </span>
        ))}
        {billMark && <span className={styles.notice}>Pidió la cuenta</span>}
        {voidMark && <span className={styles.notice}>Anulación pedida</span>}
      </Link>
    </motion.li>
  );
}

/** Tablero del salón con polling cada 5 s (D-011-03). */
function WaiterBoard({ tables }: { tables: BoardTable[] }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [openError, setOpenError] = useState<string>();
  const opening = useRef(false);
  const selectionTrigger = useRef<HTMLAnchorElement | null>(null);
  const restoreTableFocus = useRef(true);
  const active = tables.filter((table) => table.isActive);
  const openTable = useMutation({
    mutationFn: (tableId: number) => openTableOrder(tableId),
    onSuccess: (_order, tableId) => {
      setOpenError(undefined);
      restoreTableFocus.current = false;
      setSelectedTableId(null);
      router.push(`/mozo/mesas/${tableId}/agregar`);
      void queryClient.invalidateQueries({ queryKey: ['waiter', 'tables'] });
    },
    onError: async (error, tableId) => {
      setOpenError(apiErrorMessage(error));
      if (error instanceof ApiError && error.code === 'TABLE_OCCUPIED') {
        setSelectedTableId(null);
        await queryClient.invalidateQueries({ queryKey: ['waiter', 'tables'] });
        const refreshedTables = queryClient.getQueryData<BoardTable[]>(['waiter', 'tables']);
        if (refreshedTables?.some((table) => table.id === tableId && table.isActive))
          setSelectedTableId(tableId);
      } else {
        void queryClient.invalidateQueries({ queryKey: ['waiter', 'tables'] });
      }
    },
    onSettled: () => {
      opening.current = false;
    },
  });
  const closeActions = () => {
    setSelectedTableId(null);
    setOpenError(undefined);
  };
  useEffect(() => {
    if (selectedTableId === null && restoreTableFocus.current) {
      if (selectionTrigger.current?.isConnected) selectionTrigger.current.focus();
      else document.querySelector<HTMLAnchorElement>('[data-layout="table-board"] a')?.focus();
    }
  }, [selectedTableId]);
  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe(({ query }) => {
      const tablesQuery = queryClient.getQueryCache().find({ queryKey: ['waiter', 'tables'] });
      if (query.queryHash !== tablesQuery?.queryHash) return;
      const latestTables = query.state.data as BoardTable[] | undefined;
      if (
        selectedTableId !== null &&
        latestTables !== undefined &&
        !latestTables.some((table) => table.id === selectedTableId && table.isActive)
      ) {
        setSelectedTableId(null);
        setOpenError(undefined);
      }
    });
    return unsubscribe;
  }, [queryClient, selectedTableId]);
  useEffect(() => {
    if (selectedTableId === null) return;
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || opening.current) return;
      event.preventDefault();
      setSelectedTableId(null);
      setOpenError(undefined);
    };
    document.addEventListener('keydown', dismissOnEscape);
    return () => document.removeEventListener('keydown', dismissOnEscape);
  }, [selectedTableId]);
  const selectedTable =
    selectedTableId === null ? undefined : active.find((table) => table.id === selectedTableId);
  return (
    <>
      <header className={styles.boardHeader}>
        <div>
          <h1 className={styles.heading}>Mesas</h1>
          <p className={styles.description}>Selecciona una mesa para ver su pedido.</p>
        </div>
        <p className={styles.activeCount} aria-live="polite">
          <span className="sr-only">
            {active.length} {active.length === 1 ? 'mesa activa' : 'mesas activas'}
          </span>
          <strong aria-hidden="true">{active.length}</strong>{' '}
          <span aria-hidden="true">{active.length === 1 ? 'mesa activa' : 'mesas activas'}</span>
        </p>
      </header>
      <div className={styles.legend} role="group" aria-label="Estados de mesa">
        {(['free', 'occupied', 'ready', 'bill_requested'] as const).map((state) => (
          <span key={state} className={styles.badge} data-state={state}>
            {TABLE_STATE_LABELS[state]}
          </span>
        ))}
      </div>
      {active.length === 0 ? (
        <p>No hay mesas activas.</p>
      ) : (
        <ul className={styles.board} data-layout="table-board">
          {active.map((table) => (
            <TableCard
              key={table.id}
              table={table}
              onSelect={(id, trigger) => {
                selectionTrigger.current = trigger;
                restoreTableFocus.current = true;
                setOpenError(undefined);
                setSelectedTableId(id);
              }}
            />
          ))}
        </ul>
      )}
      <ModalOverlay
        isOpen={selectedTable !== undefined}
        isDismissable
        onOpenChange={(isOpen) => {
          if (!isOpen && !openTable.isPending) closeActions();
        }}
        className={styles.actionOverlay}
      >
        <Modal className={styles.actionModal}>
          <Dialog aria-labelledby="table-actions-title" className={styles.actionDialog}>
            {selectedTable && (
              <>
                <h2 id="table-actions-title" className={styles.actionTitle}>
                  Acciones de {selectedTable.name}
                </h2>
                {openError && (
                  <p role="alert" className={styles.actionError}>
                    {openError}
                  </p>
                )}
                {selectedTable.state === 'free' ? (
                  <div className={styles.actionButtons}>
                    <Button
                      className="min-h-12"
                      isDisabled={openTable.isPending}
                      onPress={() => {
                        if (opening.current) return;
                        opening.current = true;
                        setOpenError(undefined);
                        openTable.mutate(selectedTable.id);
                      }}
                    >
                      {openTable.isPending ? 'Abriendo mesa…' : 'Abrir mesa'}
                    </Button>
                    <Button
                      className="min-h-12"
                      variant="secondary"
                      isDisabled={openTable.isPending}
                      onPress={() => {
                        closeActions();
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <div className={styles.actionButtons}>
                    <Link
                      className={styles.actionPrimary}
                      href={`/mozo/mesas/${selectedTable.id}/agregar`}
                    >
                      Agregar productos
                    </Link>
                    <Link
                      className={styles.actionSecondary}
                      href={`/mozo/mesas/${selectedTable.id}`}
                    >
                      Ver pedido
                    </Link>
                    <Button className="min-h-12" variant="secondary" onPress={closeActions}>
                      Cancelar
                    </Button>
                  </div>
                )}
              </>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
      <WaiterPrintAttention />
    </>
  );
}

export default function Page() {
  // La consulta corre por encima del RoleGuard para que 'Cargando mesas...' sea
  // el único role=status de la pantalla (el guard muestra 'Cargando...').
  const tables = useQuery({
    queryKey: ['waiter', 'tables'],
    queryFn: getBoardTables,
    retry: false,
    refetchInterval: 5000,
  });
  if (tables.isPending)
    return (
      <ScreenState>
        <p role="status" className="p-6 text-center">
          Cargando mesas...
          <span className="sr-only">Cargando...</span>
        </p>
      </ScreenState>
    );
  // Cualquier fallo (API o red) muestra la misma pantalla de reintento dentro
  // del chrome del guard (AC-06, ADV-011-03).
  const isNetworkFailure =
    tables.error instanceof ApiError && tables.error.code === 'NETWORK_ERROR';
  return (
    <RoleGuard area="/mozo" appearance="pos">
      {tables.isError ? (
        <div className="space-y-4 p-6 text-center">
          {/* Sin role=alert cuando es un fallo de red: el tablero convive con
              otros flujos del chrome (logout), que sí llevan su propio alert. */}
          <p role={isNetworkFailure ? undefined : 'alert'}>No se pudo cargar el salón.</p>
          <Button
            className="min-h-12"
            onPress={() => {
              void tables.refetch();
            }}
          >
            Reintentar
          </Button>
        </div>
      ) : tables.data !== undefined ? (
        <WaiterBoard tables={tables.data} />
      ) : null}
    </RoleGuard>
  );
}
