import { createInterface, emitKeypressEvents } from 'node:readline';
import type { Key } from 'node:readline';
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize';
import { ZodError } from 'zod';
import { displayNameSchema, strongPinSchema, usernameSchema } from '@polleria/shared';
import { ConfigError, loadConfig } from './config/env.ts';
import { createSequelize } from './db/sequelize.ts';
import { AppError } from './errors/app-error.ts';
import { defineModels } from './models/index.ts';
import { createBcryptPinHasher } from './services/auth/pin-hasher.ts';
import { createUserService, createUsernameTakenError } from './services/users/user.service.ts';

class AdminInputError extends Error {}
const CANCELLED_MESSAGE = 'Se canceló la creación del administrador.';

function readTerminalLine(prompt: string, hidden: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    let value = '';
    const previousRaw = process.stdin.isRaw;
    const finish = (cancelled: boolean): void => {
      process.stdin.off('keypress', onKey);
      process.stdin.off('end', onEnd);
      process.off('SIGINT', onEnd);
      process.stdin.setRawMode(previousRaw);
      process.stdin.pause();
      process.stdout.write('\n');
      if (cancelled) reject(new AdminInputError(CANCELLED_MESSAGE));
      else resolve(value);
    };
    const onEnd = (): void => {
      finish(true);
    };
    const onKey = (text: string | undefined, key: Key): void => {
      if (key.ctrl && (key.name === 'c' || key.name === 'd')) {
        finish(true);
        return;
      }
      if (key.name === 'return' || key.name === 'enter') {
        finish(false);
        return;
      }
      if (key.name === 'backspace') {
        if (value.length > 0) {
          value = Array.from(value).slice(0, -1).join('');
          process.stdout.write('\b \b');
        }
        return;
      }
      if (
        text !== undefined &&
        !key.ctrl &&
        !key.meta &&
        Array.from(text).every((character) => {
          const code = character.codePointAt(0) ?? 0;
          return code >= 32 && code !== 127;
        })
      ) {
        value += text;
        process.stdout.write(hidden ? '*'.repeat(Array.from(text).length) : text);
      }
    };
    process.stdout.write(prompt);
    process.stdin.on('keypress', onKey);
    process.stdin.once('end', onEnd);
    process.once('SIGINT', onEnd);
    process.stdin.setRawMode(true);
    process.stdin.resume();
  });
}
function createInputReader() {
  if (process.stdin.isTTY) {
    emitKeypressEvents(process.stdin);
    return {
      read: readTerminalLine,
      close: () => {
        process.stdin.pause();
      },
    };
  }
  const reader = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
  const lines = reader[Symbol.asyncIterator]();
  console.error(
    'Aviso: esta terminal no puede ocultar el PIN. Para que no se vea al escribirlo, usa PowerShell o el Símbolo del sistema.',
  );
  return {
    async read(prompt: string): Promise<string> {
      process.stdout.write(prompt);
      const line = await lines.next();
      if (line.done) throw new AdminInputError(CANCELLED_MESSAGE);
      return line.value;
    },
    close: () => {
      reader.close();
      process.stdin.pause();
    },
  };
}
async function main(): Promise<void> {
  const input = createInputReader();
  let sequelize: Sequelize | undefined;
  try {
    console.log('Crear un administrador del Sistema Pollería.');
    const config = loadConfig(process.env);
    sequelize = createSequelize(config.databaseUrl);
    try {
      await sequelize.authenticate();
    } catch {
      throw new AdminInputError('No se pudo conectar con la base de datos.');
    }
    const tables = await sequelize.query<{ name: string | null }>(
      "SELECT to_regclass('users') AS name",
      { type: QueryTypes.SELECT },
    );
    if (tables[0]?.name === null)
      throw new AdminInputError('Faltan las tablas de usuarios. Ejecuta primero pnpm db:migrate.');
    const models = defineModels(sequelize);
    const username = usernameSchema.parse(
      await input.read('Nombre de usuario (por ejemplo, dueno): ', false),
    );
    if (await models.User.findOne({ where: { username }, attributes: ['id'] }))
      throw createUsernameTakenError();
    const displayName = displayNameSchema.parse(
      await input.read('Nombre para mostrar (por ejemplo, Don Carlos): ', false),
    );
    // S-004-06: el comando también rechaza PIN fáciles (es la otra puerta por donde se crean PIN).
    const pin = strongPinSchema.parse(await input.read('PIN (4 a 6 dígitos): ', true));
    const repeatedPin = await input.read('Repite el PIN: ', true);
    if (pin !== repeatedPin) throw new AdminInputError('Los PIN no coinciden.');
    const user = await createUserService({ models, pinHasher: createBcryptPinHasher() }).createUser(
      { username, displayName, pin, roles: ['admin'] },
    );
    console.log(`Administrador creado: ${user.username} (${user.displayName}).`);
  } catch (error) {
    console.error(
      error instanceof ZodError
        ? error.issues[0]?.message
        : error instanceof ConfigError ||
            error instanceof AppError ||
            error instanceof AdminInputError
          ? error.message
          : 'No se pudo crear el administrador.',
    );
    process.exitCode = 1;
  } finally {
    input.close();
    await sequelize?.close().catch(() => undefined);
  }
}
void main();
