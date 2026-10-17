import { describe, expect, it } from 'vitest';
import { TIME_ZONE } from '@polleria/shared';

describe('TIME_ZONE compartida', () => {
  it('AC-01: vale exactamente America/Lima al importarse desde @polleria/shared (frontend)', () => {
    expect(TIME_ZONE).toBe('America/Lima');
  });
});
