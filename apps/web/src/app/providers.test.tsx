import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Providers } from './providers.tsx';

vi.mock('motion/react', () => ({
  MotionConfig: ({ children, reducedMotion }: { children: ReactNode; reducedMotion: string }) => (
    <div data-testid="motion-config" data-reduced-motion={reducedMotion}>
      {children}
    </div>
  ),
}));

describe('proveedores globales de la web', () => {
  it('AC-04: delega la preferencia de movimiento reducido al sistema', () => {
    render(
      <Providers>
        <p>Contenido</p>
      </Providers>,
    );

    expect(screen.getByTestId('motion-config')).toHaveAttribute('data-reduced-motion', 'user');
    expect(screen.getByText('Contenido')).toBeVisible();
  });
});
