// AC-08: interfaz funcional de reportes; MSW, sin DB ni requisitos visuales.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { dailySalesReportSchema, formatCashierSoles } from '@polleria/shared';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../../tests/msw-server.ts';
import ReportsPage from './page.tsx';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('../../../lib/navigation.ts', () => ({ hardNavigate: vi.fn() }));

const report = (date = '2031-02-03', totalCents = 2100) =>
  dailySalesReportSchema.parse({
    date,
    timeZone: 'America/Lima',
    generatedAt: '2031-02-03T15:00:00.000Z',
    totalCents,
    paymentCount: totalCents === 0 ? 0 : 1,
    methods: ['cash', 'yape', 'plin', 'card'].map((method) => ({
      method,
      totalCents: method === 'cash' ? totalCents : 0,
      paymentCount: method === 'cash' && totalCents > 0 ? 1 : 0,
    })),
    hours: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      totalCents: hour === 10 ? totalCents : 0,
      paymentCount: hour === 10 && totalCents > 0 ? 1 : 0,
    })),
    products:
      totalCents === 0
        ? []
        : [
            {
              productId: 2,
              productName: 'Pollo historico',
              productCategory: 'chicken',
              portion: 'quarter',
              cut: 'leg',
              quantity: 2,
              totalCents,
            },
          ],
    authors: totalCents === 0 ? [] : [{ userId: 7, displayName: 'Mozo original', totalCents }],
  });

const AUTH = {
  user: { id: 1, username: 'dueno', displayName: 'Carlos', roles: ['admin'] },
  expiresAt: '2099-10-20T07:00:00.000Z',
};
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ReportsPage />
    </QueryClientProvider>,
  );
}
function summary() {
  return screen.getByRole('region', { name: 'Resumen de ventas' });
}
function selectDate(date: string) {
  fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: date } });
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar', exact: true }));
}
function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe('016: pantalla de ventas cobradas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/admin/reportes');
    server.use(http.get('*/api/auth/me', () => HttpResponse.json(AUTH)));
  });

  it('AC-08: usa fecha del servidor y muestra soles exactos y desgloses historicos', async () => {
    const dates: Array<string | null> = [];
    const total = Number.MAX_SAFE_INTEGER;
    server.use(
      http.get('*/api/reports/daily-sales', ({ request }) => {
        dates.push(new URL(request.url).searchParams.get('date'));
        return HttpResponse.json(report('2031-02-03', total));
      }),
    );
    show();
    await screen.findByRole('heading', { name: 'Ventas cobradas', level: 1 });
    await waitFor(() => expect(screen.getByLabelText('Fecha')).toHaveValue('2031-02-03'));
    expect(dates[0]).toBeNull();
    expect(within(summary()).getByText(formatCashierSoles(total), { exact: true })).toBeVisible();
    expect(summary()).toHaveTextContent(/1/);
    expect(screen.getByText('Pollo historico')).toBeVisible();
    expect(screen.getByText('Mozo original')).toBeVisible();
    expect(screen.getByText(/cuarto/i)).toBeVisible();
    expect(screen.getByText(/efectivo/i)).toBeVisible();
  });

  it('AC-08: diferencia vacio de error y permite recuperar la fecha seleccionada', async () => {
    let fail = false;
    server.use(
      http.get('*/api/reports/daily-sales', ({ request }) => {
        if (fail)
          return HttpResponse.json(
            { error: { code: 'INTERNAL_ERROR', message: 'Intenta de nuevo.', details: null } },
            { status: 500 },
          );
        return HttpResponse.json(
          report(new URL(request.url).searchParams.get('date') ?? '2031-02-03', 0),
        );
      }),
    );
    show();
    await waitFor(() => expect(screen.getByLabelText('Fecha')).toHaveValue('2031-02-03'));
    expect(within(summary()).getByText('S/ 0,00', { exact: true })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fail = true;
    selectDate('2031-02-04');
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Resumen de ventas' })).not.toBeInTheDocument();
    fail = false;
    fireEvent.click(
      screen.queryByRole('button', { name: /reintentar/i }) ??
        screen.getByRole('button', { name: 'Actualizar', exact: true }),
    );
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(within(summary()).getByText('S/ 0,00', { exact: true })).toBeVisible();
    expect(screen.getByLabelText('Fecha')).toHaveValue('2031-02-04');
  });

  it('AC-08: dos cambios rapidos no dejan que respuesta antigua pise fecha ni total', async () => {
    const old = barrier();
    const latest = barrier();
    const oldReturned = barrier();
    const reached: string[] = [];
    server.use(
      http.get('*/api/reports/daily-sales', async ({ request }) => {
        const date = new URL(request.url).searchParams.get('date');
        if (date !== null) reached.push(date);
        if (date === '2031-02-04') {
          await old.promise;
          oldReturned.release();
          return HttpResponse.json(report(date, 1700));
        }
        if (date === '2031-02-05') {
          await latest.promise;
          return HttpResponse.json(report(date, 4200));
        }
        return HttpResponse.json(report());
      }),
    );
    show();
    try {
      await waitFor(() => expect(screen.getByLabelText('Fecha')).toHaveValue('2031-02-03'));
      selectDate('2031-02-04');
      await waitFor(() => expect(reached).toContain('2031-02-04'));
      expect(screen.queryByRole('region', { name: 'Resumen de ventas' })).not.toBeInTheDocument();
      selectDate('2031-02-05');
      await waitFor(() => expect(reached).toContain('2031-02-05'));
      latest.release();
      await waitFor(() =>
        expect(within(summary()).getByText('S/ 42,00', { exact: true })).toBeVisible(),
      );
      await act(async () => {
        old.release();
        await oldReturned.promise;
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(screen.getByLabelText('Fecha')).toHaveValue('2031-02-05');
      expect(within(summary()).getByText('S/ 42,00', { exact: true })).toBeVisible();
      expect(within(summary()).queryByText('S/ 17,00')).not.toBeInTheDocument();
    } finally {
      old.release();
      latest.release();
    }
  });

  it('AC-01/08: pagina impide consultar el reporte al mozo', async () => {
    const reads = vi.fn();
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({ ...AUTH, user: { ...AUTH.user, roles: ['waiter'] } }),
      ),
      http.get('*/api/reports/daily-sales', () => {
        reads();
        return HttpResponse.json(report());
      }),
    );
    show();
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(reads).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('heading', { name: 'Ventas cobradas', level: 1 }),
    ).not.toBeInTheDocument();
  });
});
