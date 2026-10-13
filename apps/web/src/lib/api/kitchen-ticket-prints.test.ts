import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../../tests/msw-server.ts';
import {
  listOrderTicketPrints,
  listKitchenTicketPrintAttention,
  reprintKitchenTicket,
} from './kitchen-ticket-prints.ts';

const attempt = {
  id: 21,
  ticketId: 5,
  copyNumber: 0,
  status: 'failed',
  requestedBy: { id: 7, displayName: 'Juan' },
  createdAt: '2026-10-12T15:00:00.000Z',
  startedAt: '2026-10-12T15:00:01.000Z',
  finishedAt: '2026-10-12T15:00:02.000Z',
  pageCount: 1,
  completedPages: 0,
  errorCode: 'PRINTER_OUTPUT_FAILED',
};
const print = {
  ticketId: 5,
  orderId: 41,
  kind: 'initial',
  tablesAtIssue: [{ id: 3, name: 'Mesa 3' }],
  status: 'failed',
  lastAttempt: attempt,
  canReprint: true,
};
const queued = {
  ...attempt,
  id: 22,
  copyNumber: 1,
  status: 'queued',
  startedAt: null,
  finishedAt: null,
  pageCount: null,
  completedPages: 0,
  errorCode: null,
};
const key = 'copia-5-0123456789abcdef';
const reason = 'Revisé la carpeta y falta la comanda';
const routes = [
  {
    name: 'pedido',
    method: http.get,
    path: '*/api/orders/41/ticket-prints',
    status: 200,
    body: { prints: [print] },
    call: () => listOrderTicketPrints(41),
  },
  {
    name: 'atención',
    method: http.get,
    path: '*/api/kitchen-ticket-prints/attention',
    status: 200,
    body: { prints: [print], nextAfterTicketId: null },
    call: () => listKitchenTicketPrintAttention(),
  },
  {
    name: 'copia',
    method: http.post,
    path: '*/api/kitchen-ticket-prints/5/reprint',
    status: 202,
    body: { attempt: queued },
    call: () => reprintKitchenTicket(5, key, reason),
  },
];

describe('013: cliente estricto de generación de comandas', () => {
  it.each(routes)('AC-12: $name usa su ruta aprobada y devuelve el sobre exacto', async (route) => {
    server.use(
      route.method(route.path, ({ request }) => {
        expect(request.credentials).toBe('same-origin');
        return HttpResponse.json(route.body, { status: route.status });
      }),
    );
    await expect(route.call()).resolves.toEqual(route.body);
  });

  it('AC-12: atención pagina por afterTicketId sin cambiar la página fija de 50', async () => {
    const seen: string[] = [];
    server.use(
      http.get('*/api/kitchen-ticket-prints/attention', ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json({ prints: [], nextAfterTicketId: null });
      }),
    );
    await listKitchenTicketPrintAttention();
    await listKitchenTicketPrintAttention(50);
    expect(seen).toEqual(['', '?afterTicketId=50']);
  });

  it('AC-13: copia envía motivo y clave exactos, replay 202 conserva el intento queued original', async () => {
    const bodies: unknown[] = [];
    const keys: (string | null)[] = [];
    server.use(
      http.post('*/api/kitchen-ticket-prints/5/reprint', async ({ request }) => {
        bodies.push(await request.json());
        keys.push(request.headers.get('Idempotency-Key'));
        expect(request.headers.get('Content-Type')).toContain('application/json');
        return HttpResponse.json({ attempt: queued }, { status: 202 });
      }),
    );
    await expect(reprintKitchenTicket(5, key, reason)).resolves.toEqual({ attempt: queued });
    await expect(reprintKitchenTicket(5, key, reason)).resolves.toEqual({ attempt: queued });
    expect(bodies).toEqual([{ reason }, { reason }]);
    expect(keys).toEqual([key, key]);
  });

  it.each(routes)(
    'AC-12: $name rechaza otro 2xx aunque tenga el cuerpo esperado',
    async (route) => {
      const status = route.status === 202 ? 200 : 201;
      server.use(route.method(route.path, () => HttpResponse.json(route.body, { status })));
      await expect(route.call()).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE', status });
    },
  );

  it.each(routes)(
    'AC-12: $name rechaza claves extra y campos requeridos ausentes del sobre',
    async (route) => {
      for (const body of [{ ...route.body, privatePath: '/tmp/secret' }, {}]) {
        server.use(
          route.method(route.path, () => HttpResponse.json(body, { status: route.status })),
        );
        await expect(route.call()).rejects.toMatchObject({
          code: 'UNEXPECTED_RESPONSE',
          status: route.status,
        });
      }
    },
  );

  it.each([
    { ...print, host: 'private-host' },
    { ...print, ticketId: 0 },
    { ...print, status: 'printed' },
    { ...print, lastAttempt: { ...attempt, cause: '/tmp/private' } },
    {
      ...print,
      lastAttempt: { ...attempt, requestedBy: { id: 7, displayName: 'Juan', pin: '2468' } },
    },
    { ...print, lastAttempt: { ...attempt, errorCode: 'INTERNAL_STACK_TRACE' } },
  ])('AC-12: rechaza una vista/intento anidado malformado %#', async (value) => {
    server.use(
      http.get('*/api/orders/41/ticket-prints', () => HttpResponse.json({ prints: [value] })),
    );
    await expect(listOrderTicketPrints(41)).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      status: 200,
    });
  });

  it.each(routes)(
    'AC-12: $name conserva 401 seguro para que la página redirija a login',
    async (route) => {
      server.use(
        route.method(route.path, () =>
          HttpResponse.json(
            {
              error: { code: 'UNAUTHENTICATED', message: 'Inicia sesión.', details: null },
            },
            { status: 401 },
          ),
        ),
      );
      await expect(route.call()).rejects.toMatchObject({
        status: 401,
        code: 'UNAUTHENTICATED',
        message: 'Inicia sesión.',
      });
    },
  );

  it.each([
    [400, 'VALIDATION_ERROR', { issues: [{ path: 'reason', message: 'Indica el motivo.' }] }],
    [403, 'FORBIDDEN', null],
    [404, 'KITCHEN_TICKET_NOT_FOUND', null],
    [409, 'PRINT_IN_PROGRESS', null],
    [409, 'PRINT_SNAPSHOT_UNAVAILABLE', null],
    [409, 'IDEMPOTENCY_CONFLICT', null],
  ])('AC-13: copia conserva el error %s/%s', async (status, code, details) => {
    server.use(
      http.post('*/api/kitchen-ticket-prints/5/reprint', () =>
        HttpResponse.json(
          {
            error: { code, message: 'Mensaje seguro.', details },
          },
          { status },
        ),
      ),
    );
    await expect(reprintKitchenTicket(5, key, reason)).rejects.toMatchObject({
      status,
      code,
      details,
    });
  });
});
