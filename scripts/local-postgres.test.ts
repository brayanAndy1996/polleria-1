import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureLocalPostgres } from './local-postgres.ts';

type PgCtlResult = { status: number | null; error?: Error };
type PgCtlOptions = { env: NodeJS.ProcessEnv };
type PgCtlRunner = (executable: string, args: string[], options: PgCtlOptions) => PgCtlResult;

const roots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'polleria-local-postgres-'));
  roots.push(root);
  return root;
}

async function writeConfig(root: string, overrides: Record<string, unknown> = {}): Promise<void> {
  const configDir = path.join(root, 'infra', '.local');
  await mkdir(configDir, { recursive: true });
  await writeFile(
    path.join(configDir, 'postgres.json'),
    JSON.stringify({
      binDir: path.join(root, 'postgres', 'bin'),
      dataDir: path.join(root, 'postgres', 'data'),
      libDir: path.join(root, 'postgres', 'lib'),
      logFile: path.join(root, 'postgres', 'postgres.log'),
      ...overrides,
    }),
  );
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('runner local de PostgreSQL', () => {
  it('AC-01: no ejecuta pg_ctl si falta la configuración local', async () => {
    const root = await createRoot();
    const calls: unknown[][] = [];
    const run: PgCtlRunner = (...args) => {
      calls.push(args);
      return { status: 0 };
    };

    expect(() => ensureLocalPostgres(root, run)).not.toThrow();
    expect(calls).toEqual([]);
  });

  it('AC-02: rechaza JSON inválido con un error claro sin ejecutar pg_ctl', async () => {
    const root = await createRoot();
    const configDir = path.join(root, 'infra', '.local');
    await mkdir(configDir, { recursive: true });
    await writeFile(path.join(configDir, 'postgres.json'), '{');
    const run: PgCtlRunner = () => ({ status: 0 });

    expect(() => ensureLocalPostgres(root, run)).toThrow(/config|JSON|válid/i);
  });

  it.each([[{ dataDir: undefined }], [{ libDir: 42 }], [{ logFile: 'relativo/postgres.log' }]])(
    'AC-02: rechaza configuración incompleta o inválida (%j)',
    async (overrides) => {
      const root = await createRoot();
      await writeConfig(root, overrides);
      let invoked = false;
      const run: PgCtlRunner = () => {
        invoked = true;
        return { status: 0 };
      };

      expect(() => ensureLocalPostgres(root, run)).toThrow();
      expect(invoked).toBe(false);
    },
  );

  it('AC-03: conserva PostgreSQL iniciado sin ejecutar start', async () => {
    const root = await createRoot();
    await writeConfig(root);
    const calls: Array<{ executable: string; args: string[]; options: PgCtlOptions }> = [];
    const run: PgCtlRunner = (executable, args, options) => {
      calls.push({ executable, args, options });
      return { status: 0 };
    };

    ensureLocalPostgres(root, run);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.executable).toBe(
      path.join(root, 'postgres', 'bin', process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl'),
    );
    expect(calls[0]?.args).toEqual(['status', '-D', path.join(root, 'postgres', 'data')]);
  });

  it('AC-04: inicia PostgreSQL apagado con argumentos separados, espera limitada y LD_LIBRARY_PATH', async () => {
    const root = await createRoot();
    await writeConfig(root);
    const calls: Array<{ args: string[]; options: PgCtlOptions }> = [];
    const run: PgCtlRunner = (_executable, args, options) => {
      calls.push({ args, options });
      return { status: calls.length === 1 ? 3 : 0 };
    };

    ensureLocalPostgres(root, run);

    expect(calls.map(({ args }) => args)).toEqual([
      ['status', '-D', path.join(root, 'postgres', 'data')],
      [
        'start',
        '-D',
        path.join(root, 'postgres', 'data'),
        '-l',
        path.join(root, 'postgres', 'postgres.log'),
        '-w',
        '-t',
        '30',
      ],
    ]);
    expect(calls[0]?.options.env.LD_LIBRARY_PATH).toContain(path.join(root, 'postgres', 'lib'));
    expect(calls[1]?.options.env.LD_LIBRARY_PATH).toContain(path.join(root, 'postgres', 'lib'));
  });

  it('AC-04: antepone libDir y conserva LD_LIBRARY_PATH heredado', async () => {
    const root = await createRoot();
    await writeConfig(root);
    const previous = process.env.LD_LIBRARY_PATH;
    const expected = [path.join(root, 'postgres', 'lib'), previous]
      .filter((part): part is string => Boolean(part))
      .join(path.delimiter);
    let received: string | undefined;
    const run: PgCtlRunner = (_executable, args, options) => {
      if (args[0] === 'status') return { status: 3 };
      received = options.env.LD_LIBRARY_PATH;
      return { status: 0 };
    };

    ensureLocalPostgres(root, run);

    expect(received).toBe(expected);
  });

  it('AC-04: falla con un error claro si status devuelve un código distinto de 0 o 3', async () => {
    const root = await createRoot();
    await writeConfig(root);
    const calls: string[][] = [];
    const run: PgCtlRunner = (_executable, args) => {
      calls.push(args);
      return { status: 1 };
    };

    expect(() => ensureLocalPostgres(root, run)).toThrow(/status|PostgreSQL|iniciar/i);
    expect(calls).toHaveLength(1);
  });

  it('AC-04: no oculta errores de ejecución de pg_ctl', async () => {
    const root = await createRoot();
    await writeConfig(root);
    const run: PgCtlRunner = () => ({
      status: null,
      error: new Error('pg_ctl no pudo ejecutarse'),
    });

    expect(() => ensureLocalPostgres(root, run)).toThrow(/pg_ctl no pudo ejecutarse/);
  });

  it('AC-04: informa si el proceso de arranque devuelve error o código no exitoso', async () => {
    const root = await createRoot();
    await writeConfig(root);
    let calls = 0;
    const run: PgCtlRunner = () => ({ status: ++calls === 1 ? 3 : 1 });

    expect(() => ensureLocalPostgres(root, run)).toThrow(/start|arranque|PostgreSQL/i);
    expect(calls).toBe(2);
  });
});
