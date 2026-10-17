import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { usePrimaryInstance } from './primary-instance.ts';

function PrimaryInstanceProbe() {
  const isPrimary = usePrimaryInstance();
  return <p>{isPrimary ? 'Contenido principal' : 'Instancia secundaria'}</p>;
}

describe('usePrimaryInstance', () => {
  it('renderiza en servidor contenido primario de forma estable', () => {
    const firstRender = renderToString(<PrimaryInstanceProbe />);
    const repeatedRender = renderToString(<PrimaryInstanceProbe />);

    expect(firstRender).toContain('Contenido principal');
    expect(repeatedRender).toBe(firstRender);
  });
});
