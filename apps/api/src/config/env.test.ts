import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigError, loadConfig } from './env.ts';

const DEV_URL = 'postgres://polleria:clave@localhost:5432/polleria_dev';
const TEST_URL = 'postgres://polleria:clave@localhost:5432/polleria_test';

const DATABASE_URL_ISSUE_MESSAGE =
  'debe ser una URL de PostgreSQL (postgres://usuario:clave@host:puerto/base).';
const PORT_ISSUE_MESSAGE = 'debe ser un número entero entre 1 y 65535.';

type Env = Record<string, string | undefined>;

/** Ejecuta loadConfig y devuelve el ConfigError lanzado (falla si no lanza o si lanza otra cosa). */
function getConfigError(env: Env): ConfigError {
  let thrown: unknown;
  try {
    loadConfig(env);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(ConfigError);
  return thrown as ConfigError;
}

/** Texto completo que podría filtrar un secreto: el mensaje y los issues serializados. */
function visibleText(error: ConfigError): string {
  return `${error.message}\n${JSON.stringify(error.issues)}`;
}

describe('loadConfig: valores por defecto y valores explícitos', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('AC-04: con solo DATABASE_URL devuelve los valores por defecto', () => {
    const config = loadConfig({ DATABASE_URL: DEV_URL });

    expect(config).toStrictEqual({
      nodeEnv: 'development',
      host: '127.0.0.1',
      port: 4000,
      databaseUrl: DEV_URL,
      databaseUrlTest: undefined,
    });
  });

  it('AC-04: con PORT, HOST y NODE_ENV definidos devuelve el puerto como número y los demás valores', () => {
    const config = loadConfig({
      DATABASE_URL: DEV_URL,
      PORT: '4500',
      HOST: '0.0.0.0',
      NODE_ENV: 'production',
    });

    expect(config).toStrictEqual({
      nodeEnv: 'production',
      host: '0.0.0.0',
      port: 4500,
      databaseUrl: DEV_URL,
      databaseUrlTest: undefined,
    });
    expect(typeof config.port).toBe('number');
  });

  it.each([
    ['1', 1],
    ['65535', 65535],
  ])('AC-04: acepta el puerto límite %s', (port, expected) => {
    expect(loadConfig({ DATABASE_URL: DEV_URL, PORT: port }).port).toBe(expected);
  });

  it('AC-04: acepta DATABASE_URL con el protocolo postgresql://', () => {
    const url = 'postgresql://polleria:clave@127.0.0.1:5432/polleria_dev';

    expect(loadConfig({ DATABASE_URL: url }).databaseUrl).toBe(url);
  });

  it('AC-04: devuelve DATABASE_URL_TEST cuando está definida y termina en _test', () => {
    const config = loadConfig({ DATABASE_URL: DEV_URL, DATABASE_URL_TEST: TEST_URL });

    expect(config.databaseUrl).toBe(DEV_URL);
    expect(config.databaseUrlTest).toBe(TEST_URL);
  });

  it('AC-04: loadConfig no lee process.env: solo usa el objeto que recibe', () => {
    vi.stubEnv('DATABASE_URL', DEV_URL);
    vi.stubEnv('PORT', '4999');

    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(loadConfig({ DATABASE_URL: DEV_URL }).port).toBe(4000);
  });
});

describe('loadConfig: configuración inválida', () => {
  it('AC-05: sin DATABASE_URL y con PORT=abc informa ambos problemas a la vez', () => {
    const error = getConfigError({ PORT: 'abc' });

    expect(error.issues).toEqual(
      expect.arrayContaining([
        { variable: 'DATABASE_URL', message: 'es obligatoria.' },
        { variable: 'PORT', message: PORT_ISSUE_MESSAGE },
      ]),
    );
  });

  it('AC-05: el mensaje del error empieza con "Configuración inválida." y trae una línea "- VARIABLE: mensaje" por problema', () => {
    const error = getConfigError({ PORT: 'abc' });
    const lines = error.message.split(/\r?\n/);

    expect(error.message.startsWith('Configuración inválida.')).toBe(true);
    expect(error.issues.length).toBeGreaterThanOrEqual(2);
    for (const issue of error.issues) {
      expect(lines).toContain(`- ${issue.variable}: ${issue.message}`);
    }
  });

  it('AC-05: ConfigError es un Error', () => {
    expect(getConfigError({})).toBeInstanceOf(Error);
  });

  it.each([
    ['otro protocolo (mysql)', 'mysql://polleria:SuperSecreta123@localhost/polleria_dev'],
    ['un texto que no es URL', 'SuperSecreta123'],
    [
      'una URL de PostgreSQL sin nombre de base',
      'postgres://polleria:SuperSecreta123@localhost:5432',
    ],
    [
      'una URL de PostgreSQL con barra final y sin nombre de base',
      'postgres://polleria:SuperSecreta123@localhost:5432/',
    ],
  ])(
    'AC-05: DATABASE_URL con %s produce el issue de URL de PostgreSQL sin filtrar la clave',
    (_nombre, url) => {
      const error = getConfigError({ DATABASE_URL: url });

      expect(error.issues).toContainEqual({
        variable: 'DATABASE_URL',
        message: DATABASE_URL_ISSUE_MESSAGE,
      });
      expect(visibleText(error)).not.toContain('SuperSecreta123');
      expect(visibleText(error)).not.toContain(url);
    },
  );

  it.each(['0', '65536', '4000.5', '-1', 'abc'])(
    'AC-05: PORT=%j produce el issue de PORT',
    (port) => {
      const error = getConfigError({ DATABASE_URL: DEV_URL, PORT: port });

      expect(error.issues).toEqual([{ variable: 'PORT', message: PORT_ISSUE_MESSAGE }]);
    },
  );

  it('AC-05: NODE_ENV=staging produce el issue de NODE_ENV', () => {
    const error = getConfigError({ DATABASE_URL: DEV_URL, NODE_ENV: 'staging' });

    expect(error.issues).toEqual([
      { variable: 'NODE_ENV', message: 'debe ser development, test o production.' },
    ]);
  });

  it('AC-05: HOST vacío produce el issue de HOST', () => {
    const error = getConfigError({ DATABASE_URL: DEV_URL, HOST: '' });

    expect(error.issues).toEqual([{ variable: 'HOST', message: 'no puede estar vacía.' }]);
  });

  it('AC-05: acumula los problemas de varias variables en un solo ConfigError', () => {
    const error = getConfigError({
      NODE_ENV: 'staging',
      HOST: '',
      PORT: '0',
      DATABASE_URL: 'SuperSecreta123',
    });
    const variables = error.issues.map((issue: { variable: string }) => issue.variable).sort();

    expect(variables).toEqual(['DATABASE_URL', 'HOST', 'NODE_ENV', 'PORT']);
    expect(visibleText(error)).not.toContain('SuperSecreta123');
  });
});

describe('loadConfig: protección de la base en modo test', () => {
  it('AC-06: con NODE_ENV=test y DATABASE_URL de polleria_dev lanza el issue de base no _test', () => {
    const error = getConfigError({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://polleria:Secreta_123@localhost:5432/polleria_dev',
    });

    expect(error.issues).toContainEqual({
      variable: 'DATABASE_URL',
      message: 'con NODE_ENV=test la base debe terminar en _test.',
    });
    expect(visibleText(error)).not.toContain('Secreta_123');
  });

  it('AC-06: con NODE_ENV=test y DATABASE_URL de polleria_test no lanza', () => {
    const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: TEST_URL });

    expect(config.nodeEnv).toBe('test');
    expect(config.databaseUrl).toBe(TEST_URL);
  });

  it('AC-06: con NODE_ENV=development la base de desarrollo sigue siendo válida', () => {
    expect(() => loadConfig({ NODE_ENV: 'development', DATABASE_URL: DEV_URL })).not.toThrow();
  });

  it.each(['development', 'test', 'production'])(
    'AC-06: con NODE_ENV=%s y DATABASE_URL_TEST que no termina en _test lanza el issue de DATABASE_URL_TEST',
    (nodeEnv) => {
      const error = getConfigError({
        NODE_ENV: nodeEnv,
        DATABASE_URL: TEST_URL,
        DATABASE_URL_TEST: 'postgres://polleria:Secreta_123@localhost:5432/polleria_dev',
      });

      expect(error.issues).toContainEqual({
        variable: 'DATABASE_URL_TEST',
        message: 'debe apuntar a una base cuyo nombre termine en _test.',
      });
      expect(visibleText(error)).not.toContain('Secreta_123');
    },
  );

  it.each([
    ['polleria_TEST', 'postgres://polleria:Secreta_123@localhost:5432/polleria_TEST'],
    ['polleria_test_copia', 'postgres://polleria:Secreta_123@localhost:5432/polleria_test_copia'],
    ['test', 'postgres://polleria:Secreta_123@localhost:5432/test'],
    [
      'nombre codificado polleria%5Ftest',
      'postgres://polleria:Secreta_123@localhost:5432/polleria%5Ftest',
    ],
    [
      'parámetro database que cambia la base',
      'postgres://polleria:Secreta_123@localhost:5432/polleria_test?database=polleria_dev',
    ],
  ])('AC-06: DATABASE_URL_TEST con %s se rechaza con las reglas de AC-11', (_nombre, url) => {
    const error = getConfigError({ DATABASE_URL: DEV_URL, DATABASE_URL_TEST: url });

    expect(error.issues).toContainEqual({
      variable: 'DATABASE_URL_TEST',
      message: 'debe apuntar a una base cuyo nombre termine en _test.',
    });
    expect(visibleText(error)).not.toContain('Secreta_123');
  });

  it('AC-06: con DATABASE_URL de polleria_dev y DATABASE_URL_TEST de polleria_test, fuera del modo test, no lanza', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'development', DATABASE_URL: DEV_URL, DATABASE_URL_TEST: TEST_URL }),
    ).not.toThrow();
  });
});
