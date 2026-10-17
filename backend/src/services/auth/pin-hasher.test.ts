import { describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcrypt';
import { PIN_HASH_COST, createBcryptPinHasher } from './pin-hasher.ts';

describe('003: hash del PIN', () => {
  it('AC-08: bcrypt usa costo 10, sal aleatoria y conserva ceros iniciales', async () => {
    const hasher = createBcryptPinHasher();
    const first = await hasher.hash('0007');
    const second = await hasher.hash('0007');
    expect(PIN_HASH_COST).toBe(10);
    expect(first).toHaveLength(60);
    expect(first).toMatch(/^\$2b\$10\$/);
    expect(first).not.toBe(second);
    expect(await hasher.verify('0007', first)).toBe(true);
    expect(await hasher.verify('0008', first)).toBe(false);
    expect(await hasher.verify('0007', 'no-es-un-hash')).toBe(false);
    expect(await hasher.verify('0007', '')).toBe(false);
    const fastHash = await createBcryptPinHasher({ cost: 4 }).hash('1234');
    expect(fastHash).toMatch(/^\$2b\$04\$/);
    expect(await hasher.verify('1234', fastHash)).toBe(true);
  });
  it('AC-08: una falla de bcrypt al comparar devuelve false', async () => {
    const spy = vi.spyOn(bcrypt, 'compare').mockImplementationOnce(() => {
      throw new Error('Falla simulada');
    });
    try {
      await expect(createBcryptPinHasher().verify('0007', 'hash')).resolves.toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});
