import { describe, expect, it } from 'vitest';
import { maskEmail } from '../mask-email';

describe('maskEmail', () => {
  it('keeps the first char and the full domain', () => {
    expect(maskEmail('alice@example.com')).toBe('a***@example.com');
    expect(maskEmail('bob@gmail.com')).toBe('b***@gmail.com');
  });

  it('masks short local-parts the same way', () => {
    expect(maskEmail('a@x.com')).toBe('a***@x.com');
  });

  it('uses the last @ so `+tag` style addresses still work', () => {
    expect(maskEmail('alice+newsletter@example.com')).toBe('a***@example.com');
  });

  it('returns a sentinel for malformed input', () => {
    expect(maskEmail('')).toBe('<invalid>');
    expect(maskEmail(null)).toBe('<invalid>');
    expect(maskEmail(undefined)).toBe('<invalid>');
    expect(maskEmail('no-at-sign')).toBe('<invalid>');
    expect(maskEmail('@startswithat.com')).toBe('<invalid>');
    expect(maskEmail('endswith@')).toBe('<invalid>');
  });
});
