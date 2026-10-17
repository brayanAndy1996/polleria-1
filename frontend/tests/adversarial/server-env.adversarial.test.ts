/**
 * Ataque a la configuración de la web (adversarial-tester, spec 001, AC-28).
 *
 * loadWebServerConfig solo quita las barras finales de API_INTERNAL_URL. Si el valor trae una ruta,
 * una query o un fragmento, los conserva. next.config.ts arma el destino del rewrite como
 * `${apiInternalUrl}/api/:path*`, así que una URL como http://127.0.0.1:4000/base produce el destino
 * http://127.0.0.1:4000/base/api/:path* y la web deja de alcanzar la API en silencio (todas las
 * rutas /api caen en 404 contra un prefijo inexistente). El usuario solo ve "Sin conexión con el
 * servidor" sin pista de la causa.
 *
 * Hallazgo ADV-001-09 (Bajo): la configuración debería normalizar o rechazar un API_INTERNAL_URL con
 * ruta, query o fragmento, para que el destino del rewrite quede siempre bien formado.
 */
import { describe, expect, it } from 'vitest';
import { loadWebServerConfig } from '../../src/config/server-env.ts';

/** Reproduce el destino del rewrite que arma next.config.ts a partir de apiInternalUrl. */
function rewriteDestination(apiInternalUrl: string): string {
  return `${apiInternalUrl}/api/:path*`;
}

describe('loadWebServerConfig: API_INTERNAL_URL con ruta, query o fragmento', () => {
  it('ADV-001-09: una API_INTERNAL_URL con ruta no debería romper el destino del rewrite', () => {
    const { apiInternalUrl } = loadWebServerConfig({
      API_INTERNAL_URL: 'http://127.0.0.1:4000/base',
    });

    const destination = rewriteDestination(apiInternalUrl);
    // Propiedad deseada: el destino termina exactamente en "/api/:path*", sin un prefijo de ruta
    // extra que haga que todas las solicitudes a la API caigan en 404.
    expect(destination).toBe('http://127.0.0.1:4000/api/:path*');
  });

  it('ADV-001-09: una API_INTERNAL_URL con query o fragmento no debería conservarlos', () => {
    const withQuery = loadWebServerConfig({ API_INTERNAL_URL: 'http://127.0.0.1:4000/?x=1' });
    const withFragment = loadWebServerConfig({ API_INTERNAL_URL: 'http://127.0.0.1:4000/#frag' });

    expect(withQuery.apiInternalUrl).toBe('http://127.0.0.1:4000');
    expect(withFragment.apiInternalUrl).toBe('http://127.0.0.1:4000');
  });
});
