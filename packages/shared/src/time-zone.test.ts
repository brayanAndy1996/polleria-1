import { describe, expect, it } from 'vitest';
import { TIME_ZONE } from '@polleria/shared';

describe('TIME_ZONE', () => {
  it('AC-01: vale exactamente America/Lima al importarse desde @polleria/shared (packages/shared)', () => {
    expect(TIME_ZONE).toBe('America/Lima');
  });

  it('AC-01: TIME_ZONE es de tipo literal America/Lima', () => {
    const literal: 'America/Lima' = TIME_ZONE;

    expect(literal).toBe('America/Lima');
  });
});
