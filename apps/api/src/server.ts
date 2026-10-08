import http from 'node:http';
import type { Server } from 'node:http';
import { createApp } from './app.ts';
import { ConfigError, loadConfig } from './config/env.ts';
import type { AppConfig } from './config/env.ts';
import { createSequelize } from './db/sequelize.ts';

/** Tiempo máximo para cerrar con SIGINT o SIGTERM antes de salir a la fuerza. */
const SHUTDOWN_TIMEOUT_MS = 10_000;

/** Pone el servidor a escuchar. Rechaza con el error de Node (por ejemplo EADDRINUSE). */
function listen(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function isAddressInUse(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EADDRINUSE';
}

/**
 * Arranca la API. Solo lee process.env: el archivo .env lo carga `node --env-file-if-exists` desde
 * los scripts de package.json. Nunca escribe DATABASE_URL ni la clave en la salida (RN-001-01).
 */
async function main(): Promise<void> {
  let config: AppConfig;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  // Sequelize conecta bajo demanda: la API arranca aunque PostgreSQL esté apagado (S-04).
  const sequelize = createSequelize(config.databaseUrl);
  const server = http.createServer(createApp({ sequelize }));

  try {
    await listen(server, config.host, config.port);
  } catch (error) {
    console.error(
      isAddressInUse(error)
        ? `El puerto ${String(config.port)} ya está en uso. Cambia PORT en apps/api/.env.`
        : 'No se pudo iniciar la API en la dirección y el puerto configurados.',
    );
    await sequelize.close();
    process.exitCode = 1;
    return;
  }

  console.log(`API escuchando en http://${config.host}:${String(config.port)}`);

  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    // Si algo cuelga el cierre, sale a la fuerza. unref evita que este temporizador sostenga el proceso.
    setTimeout(() => {
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();

    server.close(() => {
      sequelize.close().then(
        () => {
          process.exitCode = 0;
        },
        () => {
          process.exitCode = 1;
        },
      );
    });
    server.closeIdleConnections();
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error('No se pudo iniciar la API.', error instanceof Error ? error.message : '');
  process.exitCode = 1;
});
