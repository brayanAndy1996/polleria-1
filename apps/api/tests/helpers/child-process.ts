/**
 * Helpers para las pruebas que arrancan procesos reales (AC-08, AC-09 y AC-24).
 *
 * El entorno del hijo se arma copiando process.env y cambiando solo las variables del caso: en
 * Windows, sin SystemRoot fallan los sockets. Los procesos arrancan sin `--env-file`, así que
 * ningún archivo .env influye.
 */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');

export const SERVER_ENTRY = path.join(REPO_ROOT, 'apps', 'api', 'src', 'server.ts');
export const CLI_ENTRY = path.join(REPO_ROOT, 'apps', 'api', 'src', 'db', 'cli.ts');
export const PRINT_TEST_PAGE_ENTRY = path.join(
  REPO_ROOT,
  'apps',
  'api',
  'src',
  'print-test-page.ts',
);

const NODE_FLAGS = ['--disable-warning=ExperimentalWarning'];

export type EnvOverrides = Record<string, string | undefined>;

/** Copia de process.env con las variables del caso. Un valor undefined borra la variable. */
export function buildChildEnv(overrides: EnvOverrides): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };

  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete env[name];
    } else {
      env[name] = value;
    }
  }

  return env;
}

export interface ExitResult {
  code: number | null;
  /** true si el proceso no terminó solo antes del tiempo límite y hubo que matarlo. */
  timedOut: boolean;
  stdout: string;
  stderr: string;
}

const liveProcesses = new Set<ManagedProcess>();

export class ManagedProcess {
  private readonly child: ChildProcess;
  private out = '';
  private err = '';
  private exited = false;
  private exitCode: number | null = null;
  private readonly exitPromise: Promise<void>;

  constructor(entry: string, args: string[], env: NodeJS.ProcessEnv, input?: string) {
    this.child = spawn(process.execPath, [...NODE_FLAGS, entry, ...args], {
      cwd: REPO_ROOT,
      env,
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child.stdin?.on('error', () => undefined);
    if (input !== undefined) this.child.stdin?.end(input);
    this.child.stdout?.setEncoding('utf8');
    this.child.stderr?.setEncoding('utf8');
    this.child.stdout?.on('data', (chunk: string) => {
      this.out += chunk;
    });
    this.child.stderr?.on('data', (chunk: string) => {
      this.err += chunk;
    });
    this.exitPromise = new Promise<void>((resolve) => {
      this.child.once('exit', (code) => {
        this.exited = true;
        this.exitCode = code;
        resolve();
      });
      this.child.once('error', () => {
        this.exited = true;
        resolve();
      });
    });
    liveProcesses.add(this);
  }

  get stdout(): string {
    return this.out;
  }

  get stderr(): string {
    return this.err;
  }

  /** Espera a que el proceso termine solo. Si pasa el tiempo límite, lo mata y lo informa. */
  async waitForExit(timeoutMs: number): Promise<ExitResult> {
    const timeout = new Promise<'timeout'>((resolve) => {
      setTimeout(() => {
        resolve('timeout');
      }, timeoutMs).unref();
    });
    const outcome = await Promise.race([this.exitPromise.then(() => 'exit' as const), timeout]);

    if (outcome === 'timeout') {
      await this.kill();
      return { code: null, timedOut: true, stdout: this.out, stderr: this.err };
    }

    return { code: this.exitCode, timedOut: false, stdout: this.out, stderr: this.err };
  }

  /** Espera a que stdout contenga el texto. Falla si el proceso termina o se acaba el tiempo. */
  async waitForStdout(text: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (!this.out.includes(text)) {
      if (this.exited) {
        throw new Error(
          `El proceso terminó (código ${String(this.exitCode)}) sin escribir "${text}". ` +
            `stdout: ${this.out}\nstderr: ${this.err}`,
        );
      }
      if (Date.now() > deadline) {
        throw new Error(
          `El proceso no escribió "${text}" en ${String(timeoutMs)} ms. ` +
            `stdout: ${this.out}\nstderr: ${this.err}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  /** Mata el proceso (si sigue vivo) y espera a que termine. */
  async kill(): Promise<void> {
    if (!this.exited) {
      this.child.kill();
    }
    await this.exitPromise;
    liveProcesses.delete(this);
  }
}

/** Mata todos los procesos hijos que sigan vivos. Se llama en afterEach de cada prueba. */
export async function killAllChildProcesses(): Promise<void> {
  await Promise.all([...liveProcesses].map((proc) => proc.kill()));
}

export function startServer(env: NodeJS.ProcessEnv): ManagedProcess {
  return new ManagedProcess(SERVER_ENTRY, [], env);
}

/** Ejecuta cli.ts con los argumentos dados y espera a que termine (máximo timeoutMs). */
export async function runCli(
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs = 12_000,
): Promise<ExitResult> {
  const proc = new ManagedProcess(CLI_ENTRY, args, env);
  const result = await proc.waitForExit(timeoutMs);
  await proc.kill();
  return result;
}

/**
 * Ejecuta print-test-page.ts (el comando `pnpm printer:test`, spec 002) y espera a que termine
 * (máximo timeoutMs). Si pasa el tiempo límite, mata el proceso.
 */
export async function runPrintTestPage(
  env: NodeJS.ProcessEnv,
  timeoutMs = 12_000,
): Promise<ExitResult> {
  const proc = new ManagedProcess(PRINT_TEST_PAGE_ENTRY, [], env);
  const result = await proc.waitForExit(timeoutMs);
  await proc.kill();
  return result;
}

/** Elige un puerto libre: abre un servidor en el puerto 0, toma el número y lo cierra. */
export async function getFreePort(): Promise<number> {
  const blocker = await occupyPort();
  await blocker.release();
  return blocker.port;
}

export interface PortBlocker {
  port: number;
  release: () => Promise<void>;
}

/** Ocupa un puerto de 127.0.0.1 hasta que se llame a release(). */
export async function occupyPort(): Promise<PortBlocker> {
  const server = net.createServer();

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve();
    });
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('No se pudo obtener el puerto asignado por el sistema.');
  }

  return {
    port: address.port,
    release: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  };
}
