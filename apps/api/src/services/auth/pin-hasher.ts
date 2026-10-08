import bcrypt from 'bcrypt';

export const PIN_HASH_COST = 10;
export interface PinHasher {
  hash(pin: string): Promise<string>;
  verify(pin: string, pinHash: string): Promise<boolean>;
}
export function createBcryptPinHasher(options: { cost?: number } = {}): PinHasher {
  const cost = options.cost ?? PIN_HASH_COST;
  return {
    hash: (pin) => bcrypt.hash(pin, cost),
    async verify(pin, pinHash) {
      try {
        return await bcrypt.compare(pin, pinHash);
      } catch {
        return false;
      }
    },
  };
}
