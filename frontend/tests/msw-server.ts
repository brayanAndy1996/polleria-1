import { setupServer } from 'msw/node';

/** Servidor MSW compartido por las pruebas de la web. Se arranca y se limpia en setup.ts. */
export const server = setupServer();
