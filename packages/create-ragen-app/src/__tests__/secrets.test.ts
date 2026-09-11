import { describe, expect, it } from 'vitest';

import { generateSecret } from '../secrets';

describe('generateSecret', () => {
  it('returns a 64-character hex string (32 bytes)', () => {
    const secret = generateSecret();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not repeat across calls', () => {
    const secrets = new Set(Array.from({ length: 20 }, () => generateSecret()));
    expect(secrets.size).toBe(20);
  });
});
