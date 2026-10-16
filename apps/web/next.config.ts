import type { NextConfig } from 'next';
import { loadWebServerConfig } from './src/config/server-env.ts';

// Next.js ya leyó apps/web/.env* antes de cargar este archivo. Si algo es inválido, lanza un error en
// español y la web no arranca.
const { apiInternalUrl, allowedDevOrigins } = loadWebServerConfig(process.env);

const nextConfig: NextConfig = {
  transpilePackages: ['@polleria/shared'],
  devIndicators: false,

  // Evita que `next dev` genere AGENTS.md cuando lo corre un agente de IA.
  agentRules: false,

  // Para probar desde un celular en `pnpm dev` (IP de la PC, por ejemplo 192.168.1.10).
  allowedDevOrigins,

  // Mismo origen: el navegador solo habla con la web y ella reenvía /api a la API. Sin CORS.
  rewrites() {
    return Promise.resolve([
      { source: '/api/:path*', destination: `${apiInternalUrl}/api/:path*` },
    ]);
  },
};

export default nextConfig;
