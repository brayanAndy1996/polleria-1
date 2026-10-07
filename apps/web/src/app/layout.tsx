import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from './providers.tsx';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sistema Pollería',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-PE">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
