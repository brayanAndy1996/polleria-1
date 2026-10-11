'use client';

import { Button } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { formatSoles } from '@polleria/shared';
import { tableStateSchema } from '@polleria/shared';
import Link from 'next/link';
import { RoleGuard } from '../../components/auth/role-guard.tsx';
import { ApiError, apiClient, parseResponse } from '../../lib/api/client.ts';
import { TABLE_STATE_LABELS } from '../../lib/menu-labels.ts';
/**
 * Lectura laxa del salón para el tablero (D-011-03): la tarjeta solo necesita el
 * estado del ítem para la marca 'Anulación pedida'; un ítem parcial no debe
 * tumbar el listado completo, así que se valida solo lo que la tarjeta usa.
 */
const boardOrderSchema = z.looseObject({
  id: z.number().int().positive(),
  status: z.string(),
  totalCents: z.number().int(),
  openedBy: z.looseObject({ id: z.number().int().positive(), displayName: z.string() }),
  readyAt: z.string().nullable(),
  billRequestedAt: z.string().nullable(),
  tables: z.array(z.looseObject({ id: z.number().int().positive(), name: z.string() })),
  items: z.array(z.looseObject({ status: z.string() })),
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
function TableCard({ table }: { table: BoardTable }) {
  const order = table.order;
  // Solo la mesa principal del pedido (primera en tables) nombra a las unidas;
  // una mesa cuya orden comparte la lista no repite las ajenas (AC-05).
  const coversOrder = order !== null && order.tables[0]?.id === table.id;
  const extraTables = coversOrder ? order.tables.filter((covered) => covered.id !== table.id) : [];
  const billMark =
    order !== null && order.billRequestedAt !== null && table.state !== 'bill_requested';
  const voidMark = order?.items.some((item) => item.status === 'void_requested') ?? false;
  return (
    <li>
      <Link
        href={`/mozo/mesas/${table.id}`}
        className="flex min-h-16 flex-col justify-center gap-1 rounded-2xl border border-separator bg-surface px-4 py-3 transition-colors hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
      >
        <span className="text-lg font-semibold wrap-anywhere">{table.name}</span>
        <span className="text-sm">{TABLE_STATE_LABELS[table.state]}</span>
        {order !== null && (
          <span className="text-sm">
            {order.openedBy.displayName} · {formatSoles(order.totalCents)}
          </span>
        )}
        {extraTables.map((covered) => (
          <span key={covered.id} className="text-sm">
            y {covered.name}
          </span>
        ))}
        {billMark && <span className="text-sm font-semibold">Pidió la cuenta</span>}
        {voidMark && <span className="text-sm font-semibold text-danger">Anulación pedida</span>}
      </Link>
    </li>
  );
}

/** Tablero del salón con polling cada 5 s (D-011-03). */
function WaiterBoard({ tables }: { tables: BoardTable[] }) {
  const active = tables.filter((table) => table.isActive);
  return (
    <>
      <h1 className="text-3xl font-bold">Mesas</h1>
      {active.length === 0 ? (
        <p>No hay mesas activas.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {active.map((table) => (
            <TableCard key={table.id} table={table} />
          ))}
        </ul>
      )}
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
      <p role="status" className="p-6 text-center">
        Cargando mesas...
        <span className="sr-only">Cargando...</span>
      </p>
    );
  // Solo un error de la API merece la pantalla de reintento: un fallo de red se
  // deja al guard, que sigue mostrando el chrome de sesión.
  if (tables.isError && tables.error instanceof ApiError && tables.error.code !== 'NETWORK_ERROR')
    return (
      <div className="space-y-4 p-6 text-center">
        <p role="alert">No se pudo cargar el salón.</p>
        <Button
          className="min-h-12"
          onPress={() => {
            void tables.refetch();
          }}
        >
          Reintentar
        </Button>
      </div>
    );
  return (
    <RoleGuard area="/mozo">
      {/* Etiqueta del área para lectores de pantalla: el encabezado visual es 'Mesas'. */}
      <h1 className="sr-only">Mozo</h1>
      {tables.data !== undefined ? <WaiterBoard tables={tables.data} /> : null}
    </RoleGuard>
  );
}
