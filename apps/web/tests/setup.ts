// Se ejecuta antes de cada archivo de prueba del proyecto web (registrado en vitest.config.ts).
// - Agrega los comparadores de jest-dom (toBeInTheDocument, toHaveTextContent, ...).
// - Arranca MSW: una solicitud sin handler falla en lugar de salir a la red.
// - Desmonta lo que renderizó React Testing Library y reinicia los handlers entre pruebas.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { server } from './msw-server.ts';

beforeEach(() => {
  server.use(
    http.get('*/api/kitchen-ticket-prints/attention', () =>
      HttpResponse.json({ prints: [], nextAfterTicketId: null }),
    ),
    http.get('*/api/orders/:orderId/ticket-prints', () => HttpResponse.json({ prints: [] })),
  );
});

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
