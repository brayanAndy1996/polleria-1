'use client';

import { Button } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { formatCashierSoles, salesDateSchema, type DailySalesReport } from '@polleria/shared';
import { useState, type ReactNode } from 'react';
import { getDailySalesReport } from '../../lib/api/reports.ts';
import { apiErrorMessage } from '../../lib/api/error-message.ts';
import { CUT_LABELS, PORTION_LABELS } from '../../lib/menu-labels.ts';

const METHOD_LABELS = { cash: 'Efectivo', yape: 'Yape', plin: 'Plin', card: 'Tarjeta' };

function ReportTable({
  caption,
  headers,
  children,
}: {
  caption: string;
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="max-w-full overflow-x-auto">
      <table className="w-full text-left">
        <caption className="text-left text-xl font-bold">{caption}</caption>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} scope="col" className="p-2">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function ReportData({ report }: { report: DailySalesReport }) {
  return (
    <>
      <section aria-label="Resumen de ventas" className="space-y-2">
        <h2 className="text-xl font-bold">Total cobrado</h2>
        <p className="text-3xl font-bold tabular-nums">{formatCashierSoles(report.totalCents)}</p>
        <p>
          {report.paymentCount} {report.paymentCount === 1 ? 'cobro' : 'cobros'}
        </p>
        <p>Fecha: {report.date} · Hora del local: Lima</p>
      </section>
      {report.paymentCount === 0 && <p>No hay ventas cobradas en esta fecha.</p>}
      <ReportTable caption="Medios de pago" headers={['Medio', 'Cobros', 'Total']}>
        {report.methods.map((row) => (
          <tr key={row.method}>
            <th scope="row" className="p-2">
              {METHOD_LABELS[row.method]}
            </th>
            <td className="p-2">{row.paymentCount}</td>
            <td className="p-2 tabular-nums">{formatCashierSoles(row.totalCents)}</td>
          </tr>
        ))}
      </ReportTable>
      <ReportTable caption="Ventas por hora" headers={['Hora de Lima', 'Cobros', 'Total']}>
        {report.hours.map((row) => (
          <tr key={row.hour}>
            <th scope="row" className="p-2">
              {String(row.hour).padStart(2, '0')}:00
            </th>
            <td className="p-2">{row.paymentCount}</td>
            <td className="p-2 tabular-nums">{formatCashierSoles(row.totalCents)}</td>
          </tr>
        ))}
      </ReportTable>
      <ReportTable
        caption="Productos vendidos"
        headers={['Producto', 'Presentación', 'Parte', 'Cantidad', 'Total']}
      >
        {report.products.map((row, index) => (
          <tr key={index}>
            <th scope="row" className="p-2">
              {row.productName}
            </th>
            <td className="p-2">{row.portion === null ? 'Unidad' : PORTION_LABELS[row.portion]}</td>
            <td className="p-2">{row.cut === null ? '—' : CUT_LABELS[row.cut]}</td>
            <td className="p-2">{row.quantity}</td>
            <td className="p-2 tabular-nums">{formatCashierSoles(row.totalCents)}</td>
          </tr>
        ))}
        {report.products.length === 0 && (
          <tr>
            <td colSpan={5} className="p-2">
              Sin productos vendidos.
            </td>
          </tr>
        )}
      </ReportTable>
      <ReportTable
        caption="Ventas por usuario que registró los ítems"
        headers={['Usuario', 'Total']}
      >
        {report.authors.map((row) => (
          <tr key={row.userId}>
            <th scope="row" className="p-2">
              {row.displayName}
            </th>
            <td className="p-2 tabular-nums">{formatCashierSoles(row.totalCents)}</td>
          </tr>
        ))}
        {report.authors.length === 0 && (
          <tr>
            <td colSpan={2} className="p-2">
              Sin ventas por usuario.
            </td>
          </tr>
        )}
      </ReportTable>
    </>
  );
}

export function DailySalesReportView() {
  const [date, setDate] = useState<string>();
  const [draft, setDraft] = useState<string>();
  const [validationError, setValidationError] = useState(false);
  const query = useQuery({
    queryKey: ['reports', 'daily-sales', date],
    queryFn: () => getDailySalesReport(date),
    retry: false,
  });
  const inputDate = draft ?? query.data?.date ?? '';
  const selectedMatches = draft === undefined || draft === query.data?.date;
  return (
    <div className="min-w-0 space-y-6">
      <h1 className="text-3xl font-bold">Ventas cobradas</h1>
      <form
        noValidate
        className="flex flex-wrap items-end gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!salesDateSchema.safeParse(inputDate).success) {
            setValidationError(true);
            return;
          }
          setValidationError(false);
          if (date === inputDate) void query.refetch();
          else setDate(inputDate);
        }}
      >
        <div>
          <label htmlFor="sales-date" className="block">
            Fecha
          </label>
          <input
            id="sales-date"
            type="date"
            className="min-h-12"
            value={inputDate}
            onChange={(event) => {
              setDraft(event.target.value);
              setValidationError(false);
            }}
          />
        </div>
        <Button type="submit" className="min-h-12">
          Actualizar
        </Button>
      </form>
      {validationError ? (
        <p role="alert">Selecciona una fecha válida.</p>
      ) : query.isError ? (
        <p role="alert">{apiErrorMessage(query.error)}</p>
      ) : query.isFetching ? (
        <p role="status">Cargando ventas cobradas...</p>
      ) : selectedMatches && query.data ? (
        <ReportData report={query.data} />
      ) : (
        <p role="status">Pulsa Actualizar para consultar la fecha seleccionada.</p>
      )}
    </div>
  );
}
