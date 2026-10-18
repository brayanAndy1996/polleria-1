// AC-01/02/06: cliente de reportes con MSW, sin API/DB.
import { dailySalesReportSchema } from '@polleria/shared';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../../tests/msw-server.ts';
import { getDailySalesReport } from './reports.ts';

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

describe('016: cliente de ventas cobradas', () => {
  it('AC-02/06: deja hoy al servidor, envia fecha explicita y valida respuesta directa', async () => {
    const urls: string[] = [];
    server.use(
      http.get('*/api/reports/daily-sales', ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json(report());
      }),
    );
    await expect(getDailySalesReport()).resolves.toEqual(report());
    await expect(getDailySalesReport('2031-02-03')).resolves.toEqual(report());
    expect(urls).toEqual([
      `${window.location.origin}/api/reports/daily-sales`,
      `${window.location.origin}/api/reports/daily-sales?date=2031-02-03`,
    ]);
    server.use(
      http.get('*/api/reports/daily-sales', () => HttpResponse.json({ report: report() })),
    );
    await expect(getDailySalesReport()).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      status: 200,
    });
  });

  it('AC-01/08: conserva errores HTTP para que la pantalla gestione permisos y reintento', async () => {
    server.use(
      http.get('*/api/reports/daily-sales', () =>
        HttpResponse.json(
          { error: { code: 'FORBIDDEN', message: 'Sin permiso.', details: null } },
          { status: 403 },
        ),
      ),
    );
    await expect(getDailySalesReport()).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });
});
