import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

type LocalPostgresConfig = {
  binDir: string;
  dataDir: string;
  libDir: string;
  logFile: string;
};

type PgCtlResult = { status: number | null; error?: Error; stderr?: string };
type PgCtlOptions = { env: NodeJS.ProcessEnv };
type PgCtlRunner = (executable: string, args: string[], options: PgCtlOptions) => PgCtlResult;

const runPgCtl: PgCtlRunner = (executable, args, options) => {
  const result = spawnSync(executable, args, {
    env: options.env,
    encoding: 'utf8',
    shell: false,
  });

  return {
    status: result.status,
    ...(result.error ? { error: result.error } : {}),
    ...(result.stderr ? { stderr: result.stderr } : {}),
  };
};

function readConfig(rootDir: string): LocalPostgresConfig | undefined {
  const configPath = path.join(rootDir, 'infra', '.local', 'postgres.json');
  if (!existsSync(configPath)) return undefined;

  let value: unknown;
  try {
    value = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    throw new Error('La configuración local de PostgreSQL no contiene JSON válido.');
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('La configuración local de PostgreSQL debe ser un objeto JSON.');
  }

  const config = value as Record<string, unknown>;
  for (const key of ['binDir', 'dataDir', 'libDir', 'logFile'] as const) {
    if (typeof config[key] !== 'string' || !path.isAbsolute(config[key])) {
      throw new Error(`La configuración local de PostgreSQL requiere ${key} como ruta absoluta.`);
    }
  }

  return config as LocalPostgresConfig;
}

function runChecked(
  run: PgCtlRunner,
  executable: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  operation: string,
): PgCtlResult {
  const result = run(executable, args, { env });
  if (result.error)
    throw new Error(`No se pudo ejecutar pg_ctl para ${operation}: ${result.error.message}`);
  return result;
}

/** Inicia el PostgreSQL local solo cuando existe configuración privada para este checkout. */
export function ensureLocalPostgres(rootDir: string, run: PgCtlRunner = runPgCtl): void {
  const config = readConfig(rootDir);
  if (!config) return;

  const executable = path.join(
    config.binDir,
    process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl',
  );
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    LD_LIBRARY_PATH: [config.libDir, process.env.LD_LIBRARY_PATH]
      .filter((part): part is string => Boolean(part))
      .join(path.delimiter),
  };
  const status = runChecked(
    run,
    executable,
    ['status', '-D', config.dataDir],
    env,
    'consultar el estado',
  );

  if (status.status === 0) return;
  if (status.status !== 3) {
    const details = status.stderr?.trim();
    throw new Error(
      `pg_ctl status devolvió el código ${String(status.status)}; no se iniciará PostgreSQL.${details ? ` ${details}` : ''}`,
    );
  }

  const start = runChecked(
    run,
    executable,
    ['start', '-D', config.dataDir, '-l', config.logFile, '-w', '-t', '30'],
    env,
    'iniciar PostgreSQL',
  );
  if (start.status !== 0) {
    const details = start.stderr?.trim();
    throw new Error(
      `pg_ctl start devolvió el código ${String(start.status)}; PostgreSQL no inició. ` +
        `Revisa el log local: ${config.logFile}.${details ? ` ${details}` : ''}`,
    );
  }
}
