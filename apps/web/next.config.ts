import type { NextConfig } from 'next';

// Configuración mínima. Los rewrites de /api y allowedDevOrigins se agregan en la tarea T-23.
const nextConfig: NextConfig = {
  transpilePackages: ['@polleria/shared'],
};

export default nextConfig;
