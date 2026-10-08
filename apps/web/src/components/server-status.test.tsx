import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HEALTH_ERROR_BODY,
  mockHealth,
  respondDeferred,
  respondHealthDatabaseDown,
  respondHealthOk,
  respondHealthOkCounting,
  respondNetworkError,
} from '../../tests/health-mocks.ts';
import { ServerStatus } from './server-status.tsx';

const LOADING = 'Verificando conexión...';
const CONNECTED = 'Conectado';
const DATABASE_DOWN = 'Sin conexión con la base de datos';
const SERVER_DOWN = 'Sin conexión con el servidor';

function renderServerStatus(): { queryClient: QueryClient } {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ServerStatus />
    </QueryClientProvider>,
  );
  return { queryClient };
}

/** Texto visible del indicador, con espacios normalizados. */
function statusText(): string {
  return (screen.getByRole('status').textContent ?? '').replace(/\s+/g, ' ').trim();
}

async function expectStatusText(expected: string): Promise<void> {
  await waitFor(() => {
    expect(statusText()).toBe(expected);
  });
}

describe('ServerStatus', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('AC-26: mientras la primera consulta está en curso muestra "Verificando conexión..."', async () => {
    const gate = respondDeferred();

    renderServerStatus();

    expect(statusText()).toBe(LOADING);
    await waitFor(() => {
      expect(gate.calls).toBe(1);
    });
    expect(statusText()).toBe(LOADING);

    gate.release();
    await expectStatusText(CONNECTED);
  });

  it('AC-26: cuando la API responde 200 válido muestra "Conectado"', async () => {
    respondHealthOk();

    renderServerStatus();

    await expectStatusText(CONNECTED);
  });

  it('AC-26: cuando la API responde 503 válido muestra "Sin conexión con la base de datos"', async () => {
    respondHealthDatabaseDown();

    renderServerStatus();

    await expectStatusText(DATABASE_DOWN);
  });

  it('AC-26: cuando hay un error de red muestra "Sin conexión con el servidor"', async () => {
    respondNetworkError();

    renderServerStatus();

    await expectStatusText(SERVER_DOWN);
  });

  it('AC-26: cuando la API responde 500 muestra "Sin conexión con el servidor"', async () => {
    mockHealth(() =>
      HttpResponse.json(
        {
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Ocurrió un error inesperado. Intenta nuevamente.',
            details: null,
          },
        },
        { status: 500 },
      ),
    );

    renderServerStatus();

    await expectStatusText(SERVER_DOWN);
  });

  it('AC-26: hay un solo indicador con role="status" y anuncia los cambios con aria-live="polite"', async () => {
    respondHealthOk();

    renderServerStatus();

    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    await expectStatusText(CONNECTED);
  });

  it('Borde: el indicador sigue el resultado de la siguiente consulta (base caída y luego servidor caído)', async () => {
    respondHealthDatabaseDown();
    const { queryClient } = renderServerStatus();
    await expectStatusText(DATABASE_DOWN);

    respondNetworkError();
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['health'] });
    });

    await expectStatusText(SERVER_DOWN);
  });

  it('Borde: durante una nueva consulta se mantiene el último estado mostrado', async () => {
    respondHealthOk();
    const { queryClient } = renderServerStatus();
    await expectStatusText(CONNECTED);

    const gate = respondDeferred();
    let refetch: Promise<unknown> = Promise.resolve();
    act(() => {
      refetch = queryClient.refetchQueries({ queryKey: ['health'] });
    });
    await waitFor(() => {
      expect(gate.calls).toBe(1);
    });

    expect(statusText()).toBe(CONNECTED);

    gate.release(HttpResponse.json(HEALTH_ERROR_BODY, { status: 503 }));
    await act(async () => {
      await refetch;
    });
    await expectStatusText(DATABASE_DOWN);
  });

  it('Borde: consulta de nuevo cada 10 s y el indicador refleja el cambio sin recargar la página', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const counter = respondHealthOkCounting();

    renderServerStatus();
    await expectStatusText(CONNECTED);
    expect(counter.calls).toBe(1);

    // Antes de los 10 s no hay una segunda consulta.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });
    expect(counter.calls).toBe(1);

    // La base se cae: la siguiente consulta periódica lo refleja.
    respondHealthDatabaseDown();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    await expectStatusText(DATABASE_DOWN);
  });
});
