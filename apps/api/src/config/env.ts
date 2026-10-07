import { z } from 'zod';
import { getTestDatabaseName, isPostgresUrl } from '../db/postgres-url.ts';

/** Variables de entorno que lee la API. apps/api/.env.example debe listar exactamente estas. */
export const CONFIG_VARIABLES = [
  'NODE_ENV',
  'HOST',
  'PORT',
  'DATABASE_URL',
  'DATABASE_URL_TEST',
] as const;

const NODE_ENVS = ['development', 'test', 'production'] as const;

export interface AppConfig {
  nodeEnv: (typeof NODE_ENVS)[number];
  host: string;
  port: number;
  databaseUrl: string;
  databaseUrlTest: string | undefined;
}

export interface ConfigIssue {
  variable: string;
  message: string;
}

/**
 * Configuración inválida. Lista todos los problemas a la vez y nunca incluye los valores recibidos
 * (RN-001-01): solo el nombre de la variable y una explicación.
 */
export class ConfigError extends Error {
  readonly issues: ConfigIssue[];

  constructor(issues: ConfigIssue[]) {
    super(
      [
        'Configuración inválida.',
        ...issues.map((issue) => `- ${issue.variable}: ${issue.message}`),
      ].join('\n'),
    );
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

const PORT_MESSAGE = 'debe ser un número entero entre 1 y 65535.';
const DATABASE_URL_MESSAGE =
  'debe ser una URL de PostgreSQL (postgres://usuario:clave@host:puerto/base).';
const TEST_MODE_DATABASE_MESSAGE = 'con NODE_ENV=test la base debe terminar en _test.';
const DATABASE_URL_TEST_MESSAGE = 'debe apuntar a una base cuyo nombre termine en _test.';

function isValidPort(value: string): boolean {
  return /^\d{1,5}$/.test(value) && Number(value) >= 1 && Number(value) <= 65535;
}

// Los mensajes son propios (no los de Zod) para que ningún valor recibido llegue al texto.
const envSchema = z.object({
  NODE_ENV: z
    .enum(NODE_ENVS, { error: 'debe ser development, test o production.' })
    .default('development'),
  HOST: z.string().min(1, { error: 'no puede estar vacía.' }).default('127.0.0.1'),
  PORT: z.string().refine(isValidPort, { error: PORT_MESSAGE }).transform(Number).default(4000),
  DATABASE_URL: z
    .string({ error: 'es obligatoria.' })
    .refine(isPostgresUrl, { error: DATABASE_URL_MESSAGE }),
  DATABASE_URL_TEST: z
    .string()
    .refine((value) => getTestDatabaseName(value) !== undefined, {
      error: DATABASE_URL_TEST_MESSAGE,
    })
    .optional(),
});

/** Reglas que cruzan variables. Usan el entorno sin procesar para informar todo a la vez. */
function crossFieldIssues(env: Record<string, string | undefined>): ConfigIssue[] {
  const databaseUrl = env.DATABASE_URL;
  const isUnsafeForTestMode =
    env.NODE_ENV === 'test' &&
    isPostgresUrl(databaseUrl) &&
    getTestDatabaseName(databaseUrl) === undefined;

  return isUnsafeForTestMode
    ? [{ variable: 'DATABASE_URL', message: TEST_MODE_DATABASE_MESSAGE }]
    : [];
}

/**
 * Valida el entorno y devuelve la configuración. Solo usa el objeto recibido (nunca process.env).
 * Si hay problemas, lanza un ConfigError con todos ellos.
 */
export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const result = envSchema.safeParse(env);

  const issues: ConfigIssue[] = [
    ...(result.success
      ? []
      : result.error.issues.map((issue) => ({
          variable: String(issue.path[0]),
          message: issue.message,
        }))),
    ...crossFieldIssues(env),
  ];

  // Una sola explicación por variable.
  const uniqueIssues = issues.filter(
    (issue, index) => issues.findIndex((other) => other.variable === issue.variable) === index,
  );

  if (!result.success || uniqueIssues.length > 0) {
    throw new ConfigError(uniqueIssues);
  }

  return {
    nodeEnv: result.data.NODE_ENV,
    host: result.data.HOST,
    port: result.data.PORT,
    databaseUrl: result.data.DATABASE_URL,
    databaseUrlTest: result.data.DATABASE_URL_TEST,
  };
}
