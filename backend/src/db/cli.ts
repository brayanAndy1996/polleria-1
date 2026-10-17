import { ConfigError, loadConfig } from '../config/env.ts';
import type { AppConfig } from '../config/env.ts';
import { migrateDown, migrateUp, seedUp } from './migrator.ts';
import { createSequelize } from './sequelize.ts';

const UNKNOWN_COMMAND_MESSAGE = 'Comando desconocido. Usa: migrate, migrate:undo, seed o demo.';

const COMMANDS = {
  migrate: {
    run: migrateUp,
    doneMessage: (name: string) => `Migración aplicada: ${name}`,
    nothingToDoMessage: 'No hay migraciones pendientes.',
  },
  'migrate:undo': {
    run: migrateDown,
    doneMessage: (name: string) => `Migración revertida: ${name}`,
    nothingToDoMessage: 'No hay migraciones para revertir.',
  },
  seed: {
    run: seedUp,
    doneMessage: (name: string) => `Seed aplicado: ${name}`,
    nothingToDoMessage: 'No hay seeds pendientes.',
  },
};

type CommandName = keyof typeof COMMANDS;

function isCommandName(value: string | undefined): value is CommandName {
  return value !== undefined && Object.hasOwn(COMMANDS, value);
}

/**
 * Ejecuta el comando y devuelve el código de salida. Solo lee process.env: el archivo .env lo carga
 * `node --env-file-if-exists` desde los scripts de package.json. Nunca escribe DATABASE_URL ni la
 * clave en la salida (RN-001-01).
 */
async function main(args: string[]): Promise<number> {
  const commandName = args[0];
  const isDemo = commandName === 'demo';
  if (!isDemo && !isCommandName(commandName)) {
    console.error(UNKNOWN_COMMAND_MESSAGE);
    return 1;
  }

  // These guards run before config parsing, Sequelize construction, or any connection.
  if ((isDemo || commandName === 'seed') && process.env.NODE_ENV !== 'development') {
    console.error('Este comando solo se permite con NODE_ENV=development.');
    return 1;
  }

  const command = isDemo ? undefined : COMMANDS[commandName];

  let config: AppConfig;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }

  const sequelize = createSequelize(config.databaseUrl);
  try {
    try {
      await sequelize.authenticate();
    } catch {
      // Sin detalles del driver: podrían incluir el host o el usuario.
      console.error('No se pudo conectar con la base de datos.');
      return 1;
    }

    if (isDemo) {
      const migrations = await migrateUp(sequelize);
      if (migrations.length === 0) console.log('No hay migraciones pendientes.');
      for (const name of migrations) console.log(`Migración aplicada: ${name}`);

      const seeds = await seedUp(sequelize);
      if (seeds.length === 0) console.log('No hay seeds pendientes.');
      for (const name of seeds) console.log(`Seed aplicado: ${name}`);
    } else {
      const names = await command!.run(sequelize);
      if (names.length === 0) console.log(command!.nothingToDoMessage);
      for (const name of names) console.log(command!.doneMessage(name));
    }
    return 0;
  } catch (error) {
    console.error(
      `No se pudo completar el comando ${commandName}: ` +
        (error instanceof Error ? error.message : 'error desconocido.'),
    );
    return 1;
  } finally {
    await sequelize.close();
  }
}

process.exitCode = await main(process.argv.slice(2));
