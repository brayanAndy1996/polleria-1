import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, delay, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from './msw-server.ts';
import MozoPage from '../src/app/mozo/page.tsx';
import CajaPage from '../src/app/caja/page.tsx';
import MesaPage from '../src/app/mozo/mesas/[tableId]/page.tsx';
import { hardNavigate } from '../src/lib/navigation.ts';

const navigation = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  useParams: () => ({ tableId: '3' }),
}));
vi.mock('../src/lib/navigation.ts', () => ({ hardNavigate: vi.fn() }));
const actor = { id: 7, displayName: 'Juan' };
const stamp = '2026-10-12T15:00:00.000Z';
const order = {
  id: 41,
  status: 'open',
  tables: [{ id: 3, name: 'Mesa 3' }],
  openedBy: actor,
  openedAt: stamp,
  readyAt: null,
  billRequestedAt: null,
  closedAt: null,
  closedBy: null,
  cancelReason: null,
  mergedIntoOrderId: null,
  items: [],
  totalCents: 0,
};
const ticket = {
  id: 5,
  orderId: 41,
  kind: 'initial',
  items: [],
  createdBy: actor,
  createdAt: stamp,
};
function attempt(ticketId = 5, status = 'failed', copyNumber = 0) {
  return {
    id: ticketId + 100,
    ticketId,
    copyNumber,
    status,
    requestedBy: actor,
    createdAt: stamp,
    startedAt: status === 'queued' ? null : stamp,
    finishedAt: ['failed', 'succeeded'].includes(status) ? stamp : null,
    pageCount: status === 'queued' ? null : 1,
    completedPages: status === 'succeeded' ? 1 : 0,
    errorCode:
      status === 'failed'
        ? 'PRINTER_OUTPUT_FAILED'
        : status === 'uncertain'
          ? 'PRINT_OUTPUT_UNCERTAIN'
          : null,
  };
}
function print(ticketId = 5, status = 'failed', kind = 'initial', canReprint = true) {
  return {
    ticketId,
    orderId: 41,
    kind,
    tablesAtIssue: [{ id: ticketId, name: `Mesa al emitir ${ticketId}` }],
    status,
    lastAttempt: attempt(ticketId, status),
    canReprint,
  };
}
function session(role = 'waiter') {
  server.use(
    http.get('*/api/auth/me', () =>
      HttpResponse.json({
        user: { ...actor, username: 'juan', roles: [role] },
        expiresAt: '2026-10-20T07:00:00.000Z',
      }),
    ),
  );
}
function attention(prints = [print()]) {
  server.use(
    http.get('*/api/kitchen-ticket-prints/attention', () =>
      HttpResponse.json({ prints, nextAfterTicketId: null }),
    ),
  );
}
function show(area: 'mozo' | 'caja' | 'mesa' = 'mozo') {
  if (area === 'caja') session('cashier');
  window.history.replaceState({}, '', area === 'mesa' ? '/mozo/mesas/3' : `/${area}`);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      {area === 'mozo' ? <MozoPage /> : area === 'caja' ? <CajaPage /> : <MesaPage />}
    </QueryClientProvider>,
  );
}
function row(id = 5) {
  const node = screen.getByText(`Mesa al emitir ${id}`).closest('li, [role="listitem"]');
  if (!node) throw new Error(`Falta fila accesible de comanda ${id}`);
  return within(node as HTMLElement);
}
const error = (code = 'INTERNAL_ERROR', message = 'Mensaje seguro.') => ({
  error: { code, message, details: null },
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  session();
  attention([]);
  server.use(
    http.get('*/api/tables', () =>
      HttpResponse.json({
        tables: [{ id: 3, name: 'Mesa 3', isActive: true, state: 'occupied', order }],
      }),
    ),
    http.get('*/api/orders/41', () => HttpResponse.json(order)),
    http.get('*/api/orders/41/tickets', () => HttpResponse.json({ tickets: [ticket] })),
    http.get('*/api/orders/41/ticket-prints', () => HttpResponse.json({ prints: [print()] })),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('013: avisos integrados en mozo y caja', () => {
  it.each(['mozo', 'caja'] as const)(
    'AC-12: %s conserva su pantalla y presenta vacío/carga/error/reintento',
    async (area) => {
      server.use(
        http.get('*/api/kitchen-ticket-prints/attention', async () => {
          await delay('infinite');
          return HttpResponse.json({ prints: [], nextAfterTicketId: null });
        }),
      );
      const pending = show(area);
      expect(await screen.findByText('Cargando estado de comandas…')).toBeVisible();
      expect(
        screen.getByRole('heading', { name: area === 'mozo' ? 'Mesas' : 'Caja' }),
      ).toBeVisible();
      pending.unmount();
      server.use(
        http.get('*/api/kitchen-ticket-prints/attention', () =>
          HttpResponse.json(error(), { status: 500 }),
        ),
      );
      show(area);
      expect(
        await screen.findByText('No se pudo consultar la generación de comandas.'),
      ).toBeVisible();
      attention([]);
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
      expect(await screen.findByText('No hay comandas por revisar.')).toBeVisible();
    },
  );

  it.each(['mozo', 'caja'] as const)(
    'AC-12: %s pagina 50 resúmenes sin duplicar y refresca desde primera página',
    async (area) => {
      const calls: (string | null)[] = [];
      server.use(
        http.get('*/api/kitchen-ticket-prints/attention', ({ request }) => {
          const after = new URL(request.url).searchParams.get('afterTicketId');
          calls.push(after);
          return HttpResponse.json(
            after === '50'
              ? { prints: [print(51, 'uncertain')], nextAfterTicketId: null }
              : {
                  prints: Array.from({ length: 50 }, (_, i) => print(i + 1)),
                  nextAfterTicketId: 50,
                },
          );
        }),
      );
      show(area);
      await screen.findByText('Mesa al emitir 50');
      expect(screen.queryByText('Mesa al emitir 51')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
      expect(await screen.findByText('Mesa al emitir 51')).toBeVisible();
      expect(screen.getAllByText('Mesa al emitir 1')).toHaveLength(1);
      expect(calls).toEqual([null, '50']);
      expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
      fireEvent(document, new Event('visibilitychange'));
      fireEvent.focus(window);
      await waitFor(() => expect(calls.slice(2)).toContain(null));
    },
  );

  it('AC-12: mozo ve ANULADO como resumen sin detalle ni acción de copia', async () => {
    attention([print(9, 'failed', 'void', false)]);
    show();
    await screen.findByText('Mesa al emitir 9');
    expect(row(9).getByText(/Anulado/i)).toBeVisible();
    expect(row(9).getByText('No se pudo generar la comanda')).toBeVisible();
    expect(row(9).queryByRole('button', { name: 'Solicitar copia' })).not.toBeInTheDocument();
    expect(screen.queryByText('Motivo de la anulación')).not.toBeInTheDocument();
  });

  it.each(['mozo', 'caja'] as const)(
    'AC-12: %s consulta cada 5 s visible, conserva datos ante fallo y suspende oculto',
    async (area) => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      let calls = 0;
      let fails = false;
      server.use(
        http.get('*/api/kitchen-ticket-prints/attention', () => {
          calls += 1;
          return fails
            ? HttpResponse.json(error(), { status: 500 })
            : HttpResponse.json({ prints: [print()], nextAfterTicketId: null });
        }),
      );
      show(area);
      await screen.findByText('Mesa al emitir 5');
      expect(calls).toBe(1);
      fails = true;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(
        await screen.findByText('No se pudo consultar la generación de comandas.'),
      ).toBeVisible();
      expect(screen.getByText('Mesa al emitir 5')).toBeVisible();
      expect(calls).toBe(2);
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
      vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
      fireEvent(document, new Event('visibilitychange'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(calls).toBe(2);
      fails = false;
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
      await waitFor(() => expect(calls).toBe(3));
    },
  );

  it.each(['mozo', 'caja'] as const)(
    'AC-12: %s redirige a login ante 401 de impresión',
    async (area) => {
      server.use(
        http.get('*/api/kitchen-ticket-prints/attention', () =>
          HttpResponse.json(error('UNAUTHENTICATED'), { status: 401 }),
        ),
      );
      show(area);
      await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith('/login'));
    },
  );

  it.each(['mozo', 'caja'] as const)(
    'AC-12: %s no pinta éxito de un sobre malformado ni filtra datos privados',
    async (area) => {
      server.use(
        http.get('*/api/kitchen-ticket-prints/attention', () =>
          HttpResponse.json({
            prints: [print(5, 'succeeded')],
            nextAfterTicketId: null,
            cause: '/tmp/private-driver',
          }),
        ),
      );
      show(area);
      await screen.findByText('No se pudo consultar la generación de comandas.');
      expect(screen.queryByText('Archivo generado')).not.toBeInTheDocument();
      expect(screen.queryByText(/private-driver/)).not.toBeInTheDocument();
    },
  );
});

describe('013: estado separado por pedido y copias permitidas', () => {
  it.each(['waiter', 'admin'])(
    'AC-12: %s consulta estado separado y ofrece copia succeeded desde pedido',
    async (role) => {
      session(role);
      server.use(
        http.get('*/api/orders/41/ticket-prints', () =>
          HttpResponse.json({ prints: [print(5, 'succeeded')] }),
        ),
      );
      show('mesa');
      expect(await screen.findByText('Archivo generado')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Solicitar copia' })).toBeVisible();
      expect(screen.getByRole('heading', { name: 'Pedido' })).toBeVisible();
      expect(screen.getByText('Total S/ 0.00')).toBeVisible();
      expect(screen.queryByText('Impreso')).not.toBeInTheDocument();
    },
  );

  it.each([
    ['queued', 'En espera'],
    ['printing', 'Generando archivo…'],
    ['uncertain', 'Revisar salida'],
    ['failed', 'No se pudo generar la comanda'],
    ['not_tracked', 'Anterior a esta función'],
  ])(
    'AC-12: pedido muestra %s sin deducir salida de ticket/order ni ofrecer copia prohibida',
    async (status, label) => {
      const view =
        status === 'not_tracked'
          ? { ...print(5, status, 'initial', false), tablesAtIssue: [], lastAttempt: null }
          : print(5, status, 'initial', false);
      server.use(
        http.get('*/api/orders/41/ticket-prints', () => HttpResponse.json({ prints: [view] })),
      );
      show('mesa');
      expect(await screen.findByText(label)).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Solicitar copia' })).not.toBeInTheDocument();
      expect(screen.queryByText('Archivo generado')).not.toBeInTheDocument();
    },
  );

  it('AC-13: suspensión global por A uncertain impide copiar B succeeded aunque tenga rol', async () => {
    session('admin');
    server.use(
      http.get('*/api/orders/41/tickets', () =>
        HttpResponse.json({ tickets: [ticket, { ...ticket, id: 6, kind: 'additional' }] }),
      ),
      http.get('*/api/orders/41/ticket-prints', () =>
        HttpResponse.json({
          prints: [
            print(5, 'uncertain', 'initial', false),
            print(6, 'succeeded', 'additional', false),
          ],
        }),
      ),
    );
    show('mesa');
    await screen.findByText('Archivo generado');
    expect(screen.getByText('Revisar salida')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Solicitar copia' })).not.toBeInTheDocument();
  });

  it('AC-13: caja copia ANULADO failed/uncertain desde atención y conserva placeholder de cobro', async () => {
    attention([print(9, 'uncertain', 'void')]);
    show('caja');
    await screen.findByText('Mesa al emitir 9');
    expect(screen.getByText('Aquí cobrarás las cuentas.')).toBeVisible();
    expect(row(9).getByRole('button', { name: 'Solicitar copia' })).toBeVisible();
    expect(row(9).getByText('Revisar salida')).toBeVisible();
  });

  it('AC-13: confirmación exige motivo, cancelación no envía, doble toque hace un POST y relee tras 202', async () => {
    attention();
    let reads = 0;
    let copied = false;
    const posts: { key: string | null; body: unknown }[] = [];
    server.use(
      http.get('*/api/kitchen-ticket-prints/attention', () => {
        reads += 1;
        return HttpResponse.json({ prints: copied ? [] : [print()], nextAfterTicketId: null });
      }),
      http.post('*/api/kitchen-ticket-prints/5/reprint', async ({ request }) => {
        posts.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() });
        await delay(100);
        copied = true;
        return HttpResponse.json({ attempt: attempt(5, 'queued', 1) }, { status: 202 });
      }),
    );
    show();
    await screen.findByText('Mesa al emitir 5');
    fireEvent.click(row().getByRole('button', { name: 'Solicitar copia' }));
    let dialog = within(await screen.findByRole('dialog'));
    expect(
      dialog.getByText('La salida anterior puede existir. La copia llevará REIMPRESIÓN.'),
    ).toBeVisible();
    expect(dialog.getByText(/Mesa al emitir 5/)).toBeVisible();
    fireEvent.click(dialog.getByRole('button', { name: 'Sí, generar copia' }));
    expect(posts).toHaveLength(0);
    fireEvent.click(dialog.getByRole('button', { name: 'Cancelar' }));
    expect(posts).toHaveLength(0);
    fireEvent.click(row().getByRole('button', { name: 'Solicitar copia' }));
    dialog = within(await screen.findByRole('dialog'));
    fireEvent.change(dialog.getByLabelText('Motivo de la copia'), {
      target: { value: 'Falta el archivo original' },
    });
    const submit = dialog.getByRole('button', { name: 'Sí, generar copia' });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]!.body).toEqual({ reason: 'Falta el archivo original' });
    expect(posts[0]!.key).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Solicitando…' })).toBeDisabled();
    expect(await screen.findByText('En espera')).toBeVisible();
    await waitFor(() => expect(reads).toBeGreaterThan(1));
  });

  it('AC-13: reemplaza En espera cuando la relectura confirma la copia', async () => {
    let reads = 0;
    server.use(
      http.get('*/api/kitchen-ticket-prints/attention', () => {
        reads += 1;
        const succeeded = reads > 1;
        return HttpResponse.json({
          prints: [
            succeeded
              ? { ...print(5, 'succeeded'), lastAttempt: attempt(5, 'succeeded', 1) }
              : print(),
          ],
          nextAfterTicketId: null,
        });
      }),
      http.post('*/api/kitchen-ticket-prints/5/reprint', () =>
        HttpResponse.json({ attempt: attempt(5, 'queued', 1) }, { status: 202 }),
      ),
    );
    show();
    await screen.findByText('Mesa al emitir 5');
    fireEvent.click(row().getByRole('button', { name: 'Solicitar copia' }));
    fireEvent.change(screen.getByLabelText('Motivo de la copia'), {
      target: { value: 'Reponer salida' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sí, generar copia' }));
    expect(await screen.findByText('En espera')).toBeVisible();
    await waitFor(() => expect(reads).toBeGreaterThan(1));
    expect(await screen.findByText('Archivo generado')).toBeVisible();
  });

  it('AC-12: vuelve a consultar páginas de atención cargadas y actualiza su estado', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const cursors: (string | null)[] = [];
    let extraPageReads = 0;
    server.use(
      http.get('*/api/kitchen-ticket-prints/attention', ({ request }) => {
        const after = new URL(request.url).searchParams.get('afterTicketId');
        cursors.push(after);
        if (after === '50') {
          extraPageReads += 1;
          const printView =
            extraPageReads === 1
              ? print(51, 'failed', 'initial', true)
              : print(51, 'uncertain', 'initial', false);
          return HttpResponse.json({ prints: [printView], nextAfterTicketId: null });
        }
        return HttpResponse.json({
          prints: Array.from({ length: 50 }, (_, i) => print(i + 1)),
          nextAfterTicketId: 50,
        });
      }),
    );
    show();
    await screen.findByText('Mesa al emitir 50');
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    await screen.findByText('Mesa al emitir 51');
    expect(row(51).getByRole('button', { name: 'Solicitar copia' })).toBeVisible();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(await row(51).findByText('Revisar salida')).toBeVisible();
    expect(row(51).queryByRole('button', { name: 'Solicitar copia' })).not.toBeInTheDocument();
    expect(cursors).toEqual([null, '50', null, '50']);
  });

  it('AC-13: pérdida de respuesta reintenta con mismo motivo/clave; nueva copia usa clave distinta', async () => {
    attention();
    const sent: { key: string | null; body: unknown }[] = [];
    server.use(
      http.post('*/api/kitchen-ticket-prints/5/reprint', async ({ request }) => {
        sent.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() });
        if (sent.length === 1) return HttpResponse.error();
        return HttpResponse.json({ attempt: attempt(5, 'queued', 1) }, { status: 202 });
      }),
    );
    show();
    await screen.findByText('Mesa al emitir 5');
    fireEvent.click(row().getByRole('button', { name: 'Solicitar copia' }));
    fireEvent.change(screen.getByLabelText('Motivo de la copia'), {
      target: { value: 'No llegó la respuesta' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sí, generar copia' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar solicitud' }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[0]!.key).toBeTruthy();
    expect(sent[1]).toEqual(sent[0]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(row().getByRole('button', { name: 'Solicitar copia' }));
    fireEvent.change(screen.getByLabelText('Motivo de la copia'), {
      target: { value: 'Otra copia explícita' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sí, generar copia' }));
    await waitFor(() => expect(sent).toHaveLength(3));
    expect(sent[2]!.key).not.toEqual(sent[0]!.key);
  });

  it.each([
    [400, 'VALIDATION_ERROR'],
    [403, 'FORBIDDEN'],
    [404, 'KITCHEN_TICKET_NOT_FOUND'],
    [409, 'PRINT_IN_PROGRESS'],
  ])('AC-13: muestra error %s/%s sin anunciar archivo generado', async (status, code) => {
    attention();
    server.use(
      http.post('*/api/kitchen-ticket-prints/5/reprint', () =>
        HttpResponse.json(
          {
            error: {
              code,
              message: 'No se aceptó esta copia.',
              details:
                status === 400
                  ? { issues: [{ path: 'reason', message: 'Revisa el motivo.' }] }
                  : null,
            },
          },
          { status },
        ),
      ),
    );
    show();
    await screen.findByText('Mesa al emitir 5');
    fireEvent.click(row().getByRole('button', { name: 'Solicitar copia' }));
    fireEvent.change(screen.getByLabelText('Motivo de la copia'), {
      target: { value: 'Revisé la salida' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sí, generar copia' }));
    expect(
      await screen.findByText(status === 400 ? 'Revisa el motivo.' : 'No se aceptó esta copia.'),
    ).toBeVisible();
    expect(screen.queryByText('Archivo generado')).not.toBeInTheDocument();
  });
});
