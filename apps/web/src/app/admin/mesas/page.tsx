'use client';

import { Button } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tableNameSchema } from '@polleria/shared';
import type { Table } from '@polleria/shared';
import { useRef, useState } from 'react';
import { RoleGuard } from '../../../components/auth/role-guard.tsx';
import { LabeledInput } from '../../../components/users/labeled-input.tsx';
import { apiErrorMessage } from '../../../lib/api/error-message.ts';
import { createTable, getTables, updateTable } from '../../../lib/api/tables.ts';
import { TABLE_STATE_LABELS } from '../../../lib/menu-labels.ts';
import { usePrimaryInstance } from '../../../lib/primary-instance.ts';

const TABLES_KEY = ['admin', 'tables'];

/** Mismo color por estado que el tablero del mozo (D-011-04): verde, ámbar, azul, morado. */
const TABLE_STATE_TEXT_CLASSES: Readonly<Record<string, string>> = {
  free: 'text-success',
  occupied: 'text-warning',
  ready: 'text-blue-600',
  bill_requested: 'text-purple-600',
};

/** Registra la mesa confirmada por la API (alta o cambio) para la lista. */
type Applied = (updated: Table) => void;

/**
 * Alta en línea (D-012-03): 'Nombre de la mesa' + 'Agregar mesa'. El nombre se
 * valida en local con tableNameSchema antes de salir el POST y el mensaje (local
 * o del servidor) aparece junto al campo; el borrador solo se limpia con el 201.
 * Un solo envío en vuelo: la marca síncrona bloquea el doble toque en el mismo
 * tick, antes de que isPending llegue al render (lección ADV-004-31).
 */
function CreateTableForm({ onApplied }: { onApplied: Applied }) {
  const [draft, setDraft] = useState('');
  const [localError, setLocalError] = useState<string>();
  const sending = useRef(false);
  const create = useMutation({
    mutationFn: (name: string) => createTable(name),
    onSuccess: (created) => {
      setDraft('');
      onApplied(created);
    },
    onSettled: () => {
      sending.current = false;
    },
  });
  const submit = () => {
    if (sending.current || create.isPending) return;
    const parsed = tableNameSchema.safeParse(draft);
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message ?? 'Revisa el nombre.');
      return;
    }
    setLocalError(undefined);
    sending.current = true;
    create.mutate(parsed.data);
  };
  const message = localError ?? (create.isError ? apiErrorMessage(create.error) : undefined);
  return (
    <div className="space-y-3">
      <LabeledInput
        id="nueva-mesa-nombre"
        label="Nombre de la mesa"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
      />
      {message && (
        <p role="alert" className="text-danger wrap-anywhere">
          {message}
        </p>
      )}
      <Button className="min-h-12" isDisabled={create.isPending} onPress={submit}>
        {create.isPending ? 'Agregando...' : 'Agregar mesa'}
      </Button>
    </div>
  );
}

/**
 * Diálogo del renombrado (D-012-04): el campo arranca con el nombre actual,
 * 'Guardar' queda inhabilitado mientras el nombre normalizado no cambie y el
 * mensaje del servidor (TABLE_NAME_TAKEN, issues, 404) aparece junto al campo.
 * Se cierra con 'Cancelar' o al confirmar el 200; la fila se actualiza con la
 * mesa confirmada por la API, nunca con el borrador.
 */
function RenamePanel({
  table,
  onApplied,
  onClose,
}: {
  table: Table;
  onApplied: Applied;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(table.name);
  const [localError, setLocalError] = useState<string>();
  const sending = useRef(false);
  const rename = useMutation({
    mutationFn: (name: string) => updateTable(table.id, { name }),
    onSuccess: (updated) => {
      onApplied(updated);
      onClose();
    },
    onSettled: () => {
      sending.current = false;
    },
  });
  // El esquema recorta, colapsa espacios y normaliza: solo un cambio real habilita.
  const parsed = tableNameSchema.safeParse(draft);
  const unchanged = parsed.success && parsed.data === table.name;
  const submit = () => {
    if (sending.current || rename.isPending || unchanged) return;
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message ?? 'Revisa el nombre.');
      return;
    }
    setLocalError(undefined);
    sending.current = true;
    rename.mutate(parsed.data);
  };
  const message = localError ?? (rename.isError ? apiErrorMessage(rename.error) : undefined);
  return (
    <section className="space-y-4 rounded-2xl border border-separator bg-surface px-5 py-4">
      <h2 className="text-xl font-semibold">Renombrar mesa</h2>
      <LabeledInput
        id={`renombrar-mesa-${table.id}`}
        label="Nombre de la mesa"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
      />
      {message && (
        <p role="alert" className="text-danger wrap-anywhere">
          {message}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {/* El nombre accesible queda fijo en 'Guardar' durante el envío: el texto
            cambia a 'Guardando...' pero el botón se sigue encontrando por su rol. */}
        <Button
          aria-label="Guardar"
          className="min-h-12"
          isDisabled={unchanged || rename.isPending}
          onPress={submit}
        >
          {rename.isPending ? 'Guardando...' : 'Guardar'}
        </Button>
        <Button
          variant="secondary"
          className="min-h-12"
          isDisabled={rename.isPending}
          onPress={onClose}
        >
          Cancelar
        </Button>
      </div>
    </section>
  );
}

/**
 * Activar/Desactivar de la fila (D-012-05, mismo patrón que ProductStateControl):
 * 'Desactivar' pide la confirmación '¿Desactivar <nombre>? No aparecerá en el
 * tablero del mozo.' con 'Sí, desactivar' y 'Cancelar'; 'Activar' envía el PATCH
 * directo. La confirmación se cierra al enviar: si la API falla (p. ej. el 409
 * TABLE_HAS_OPEN_ORDER) el mensaje aparece junto a la fila tal cual vino.
 */
function TableStateControl({ table, onApplied }: { table: Table; onApplied: Applied }) {
  const [confirming, setConfirming] = useState(false);
  const sending = useRef(false);
  const change = useMutation({
    mutationFn: (isActive: boolean) => updateTable(table.id, { isActive }),
    onSuccess: (updated) => {
      setConfirming(false);
      onApplied(updated);
    },
    onSettled: () => {
      sending.current = false;
    },
  });
  const send = (isActive: boolean) => {
    if (sending.current || change.isPending) return;
    setConfirming(false);
    sending.current = true;
    change.mutate(isActive);
  };
  return (
    <div className="space-y-3">
      {change.isError && (
        <p role="alert" className="text-danger wrap-anywhere">
          {apiErrorMessage(change.error)}
        </p>
      )}
      {table.isActive ? (
        confirming ? (
          <div className="space-y-3 rounded-xl border border-separator p-4">
            <p>{`¿Desactivar ${table.name}? No aparecerá en el tablero del mozo.`}</p>
            <div className="flex flex-wrap gap-3">
              <Button
                className="min-h-12"
                isDisabled={change.isPending}
                onPress={() => {
                  send(false);
                }}
              >
                Sí, desactivar
              </Button>
              <Button
                variant="secondary"
                className="min-h-12"
                isDisabled={change.isPending}
                onPress={() => {
                  setConfirming(false);
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="secondary"
            className="min-h-12"
            isDisabled={change.isPending}
            onPress={() => {
              setConfirming(true);
            }}
          >
            {change.isPending ? 'Desactivando...' : 'Desactivar'}
          </Button>
        )
      ) : (
        <Button
          variant="secondary"
          className="min-h-12"
          isDisabled={change.isPending}
          onPress={() => {
            send(true);
          }}
        >
          {change.isPending ? 'Activando...' : 'Activar'}
        </Button>
      )}
    </div>
  );
}

/**
 * Fila de la lista (D-012-06/D-012-07): nombre, la etiqueta del estado derivado
 * en las activas o la marca 'Desactivada' en las inactivas (que no muestran
 * estado operativo — siempre es 'free' sin pedido), y 'Renombrar' +
 * 'Desactivar'/'Activar'. Solo informativa: sin acciones del ciclo (RN-012-03).
 */
function TableRow({
  table,
  onApplied,
  onRename,
}: {
  table: Table;
  onApplied: Applied;
  onRename: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-separator bg-surface px-5 py-4">
      <div className="min-w-0 space-y-1">
        <p className="text-xl font-semibold wrap-anywhere">{table.name}</p>
        {table.isActive ? (
          <p className={`text-sm font-semibold ${TABLE_STATE_TEXT_CLASSES[table.state] ?? ''}`}>
            {TABLE_STATE_LABELS[table.state]}
          </p>
        ) : (
          <p className="text-sm font-semibold text-danger">Desactivada</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" className="min-h-12" onPress={onRename}>
          Renombrar
        </Button>
        <TableStateControl table={table} onApplied={onApplied} />
      </div>
    </li>
  );
}

/**
 * /admin/mesas (D-012-02): lista completa —activas e inactivas en el orden de la
 * API, sin paginar ni buscador— con el alta en línea al inicio y un solo panel de
 * renombrado. La consulta vive dentro del guard: 'Cargando mesas...' es el único
 * role=status una vez verificada la sesión. Sin polling (RN-012-06): se relee al
 * entrar y tras cada mutación propia por invalidación. `applied` mantiene las
 * mesas confirmadas por la API hasta que la releída las trae: cada fila cambia
 * en el mismo render que el fin del envío, sin esperar al refetch.
 */
function TablesAdmin() {
  const queryClient = useQueryClient();
  const tables = useQuery({ queryKey: TABLES_KEY, queryFn: getTables, retry: false });
  const [renaming, setRenaming] = useState<Table | null>(null);
  const [applied, setApplied] = useState<Table[]>([]);
  const applyTable: Applied = (updated) => {
    setApplied((previous) => [...previous.filter((table) => table.id !== updated.id), updated]);
    void queryClient.invalidateQueries({ queryKey: TABLES_KEY });
  };
  if (tables.isPending)
    return (
      <p role="status" className="p-6 text-center">
        Cargando mesas...
      </p>
    );
  if (tables.isError)
    return (
      <div className="space-y-4 p-6 text-center">
        <p role="alert">No se pudo cargar la lista de mesas.</p>
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
  const fetched = tables.data ?? [];
  // Las confirmadas por la API reemplazan su fila en cuanto llega la respuesta;
  // la que aún no figura en la releída (el alta nueva) va al final hasta que la
  // lista oficial la traiga ya en su orden por nombre.
  const list = fetched.map((table) => applied.find((updated) => updated.id === table.id) ?? table);
  for (const updated of applied) {
    if (!fetched.some((table) => table.id === updated.id)) list.push(updated);
  }
  return (
    <>
      <h1 className="text-3xl font-bold">Mesas</h1>
      <CreateTableForm onApplied={applyTable} />
      {renaming !== null && (
        <RenamePanel
          key={renaming.id}
          table={renaming}
          onApplied={applyTable}
          onClose={() => {
            setRenaming(null);
          }}
        />
      )}
      {list.length === 0 ? (
        <p>Todavía no hay mesas.</p>
      ) : (
        <ul className="space-y-3">
          {list.map((table) => (
            <TableRow
              key={table.id}
              table={table}
              onApplied={applyTable}
              onRename={() => {
                setRenaming(table);
              }}
            />
          ))}
        </ul>
      )}
    </>
  );
}

export default function Page() {
  const primary = usePrimaryInstance();
  return <RoleGuard area="/admin">{primary ? <TablesAdmin /> : null}</RoleGuard>;
}
