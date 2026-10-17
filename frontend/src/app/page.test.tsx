import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { respondHealthOk } from '../../tests/health-mocks.ts';
import Page from './page.tsx';
import { Providers } from './providers.tsx';

describe('Página de inicio', () => {
  it('AC-27: muestra el encabezado "Sistema Pollería" y el indicador llega a "Conectado"', async () => {
    respondHealthOk();

    render(
      <Providers>
        <Page />
      </Providers>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Sistema Pollería' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/^\s*Conectado\s*$/);
    });
  });

  it('AC-27: el indicador de estado ya está en pantalla antes de recibir la respuesta', () => {
    respondHealthOk();

    render(
      <Providers>
        <Page />
      </Providers>,
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
