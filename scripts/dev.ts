import { spawn, type ChildProcess } from 'node:child_process';
import { constants as osConstants } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureLocalPostgres } from './local-postgres.ts';

export function startDev(rootDir = process.cwd()): ChildProcess | undefined {
  try {
    ensureLocalPostgres(rootDir);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error(`No se pudo preparar PostgreSQL local: ${message}`);
    process.exitCode = 1;
    return undefined;
  }

  const child =
    process.platform === 'win32'
      ? spawn('cmd.exe', ['/d', '/s', '/c', 'pnpm -r --parallel run dev'], {
          cwd: rootDir,
          stdio: 'inherit',
          shell: false,
        })
      : spawn('pnpm', ['-r', '--parallel', 'run', 'dev'], {
          cwd: rootDir,
          stdio: 'inherit',
          shell: false,
        });
  const forwardedSignals = new Map<NodeJS.Signals, () => void>();

  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    const forward = () => {
      if (child.exitCode === null && child.signalCode === null) child.kill(signal);
    };
    forwardedSignals.set(signal, forward);
    process.on(signal, forward);
  }

  const removeSignalHandlers = () => {
    for (const [signal, handler] of forwardedSignals) process.off(signal, handler);
  };

  child.once('error', (error) => {
    removeSignalHandlers();
    console.error(`No se pudo iniciar pnpm: ${error.message}`);
    process.exitCode = 1;
  });
  child.once('exit', (code, signal) => {
    removeSignalHandlers();
    if (code !== null) {
      process.exitCode = code;
      return;
    }
    process.exitCode = signal ? 128 + (osConstants.signals[signal] ?? 1) : 1;
  });

  return child;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) startDev();
