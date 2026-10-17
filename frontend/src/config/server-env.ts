import { z } from 'zod';

/** Variables que la web lee del entorno (frontend/.env). Coinciden con frontend/.env.example. */
export const WEB_CONFIG_VARIABLES = ['API_INTERNAL_URL', 'WEB_ALLOWED_DEV_ORIGINS'] as const;

export type WebServerConfig = {
  /**
   * Origen de la API interna (protocolo, host y puerto), sin ruta, query, fragmento ni barra final.
   * A él reenvía la web las rutas /api.
   */
  apiInternalUrl: string;
  /** IP o nombres de la PC permitidos en modo desarrollo (por ejemplo, para probar desde un celular). */
  allowedDevOrigins: string[];
};

// 127.0.0.1 y no localhost: en Windows localhost puede resolver primero a ::1 y la API escucha en IPv4.
const DEFAULT_API_INTERNAL_URL = 'http://127.0.0.1:4000';

const ERROR_PREFIX = 'Configuración inválida de la web.';

// Los mensajes nunca incluyen el valor recibido: una URL podría traer usuario y clave.
const API_INTERNAL_URL_MESSAGE =
  'debe ser una URL http o https (por ejemplo http://127.0.0.1:4000).';
const API_INTERNAL_URL_CREDENTIALS_MESSAGE = 'no debe incluir usuario ni clave.';

/**
 * True si el texto trae usuario o clave. Zod ejecuta esta validación aunque `z.url` ya haya fallado,
 * así que ignora lo que no sea una URL http o https válida para no sumar un segundo error.
 */
function hasCredentials(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  return url.username !== '' || url.password !== '';
}

const webServerConfigSchema = z.object({
  API_INTERNAL_URL: z
    .url({ protocol: /^https?$/, error: API_INTERNAL_URL_MESSAGE })
    .refine((url) => !hasCredentials(url), { error: API_INTERNAL_URL_CREDENTIALS_MESSAGE })
    .default(DEFAULT_API_INTERNAL_URL)
    // Solo el origen: ruta, query y fragmento se descartan para que el rewrite quede <origen>/api/:path*.
    .transform((url) => new URL(url).origin),
  WEB_ALLOWED_DEV_ORIGINS: z
    .string()
    .default('')
    .transform((origins) =>
      origins
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin !== ''),
    ),
});

/**
 * Valida el entorno de la web y devuelve la configuración lista para next.config.ts.
 * Solo usa el objeto que recibe (nunca lee process.env por su cuenta).
 * Lanza un Error en español que nombra cada variable inválida, sin mostrar su valor.
 */
export function loadWebServerConfig(env: Record<string, string | undefined>): WebServerConfig {
  const result = webServerConfigSchema.safeParse({
    API_INTERNAL_URL: env.API_INTERNAL_URL,
    WEB_ALLOWED_DEV_ORIGINS: env.WEB_ALLOWED_DEV_ORIGINS,
  });

  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `- ${String(issue.path[0])}: ${issue.message}`,
    );
    throw new Error([ERROR_PREFIX, ...lines].join('\n'));
  }

  return {
    apiInternalUrl: result.data.API_INTERNAL_URL,
    allowedDevOrigins: result.data.WEB_ALLOWED_DEV_ORIGINS,
  };
}
