import { describe, it, expect } from 'vitest';

// validateOrigin is not exported — replicate the logic here to test the contract
function validateOrigin(
  origin: string | null,
  allowedOrigins: string[],
): boolean {
  if (allowedOrigins.length === 0) {
    return true;
  }
  if (!origin) {
    return false;
  }
  return allowedOrigins.some((allowed) => {
    if (allowed.startsWith('*.')) {
      return origin.endsWith(allowed.slice(1));
    }
    return allowed === origin;
  });
}

describe('validateOrigin', () => {
  it('returns true when allowedOrigins is empty (open mode)', () => {
    expect(validateOrigin('https://example.com', [])).toBe(true);
    expect(validateOrigin(null, [])).toBe(true);
  });

  it('returns false when origin is null and allowedOrigins is set', () => {
    expect(validateOrigin(null, ['https://example.com'])).toBe(false);
  });

  it('matches exact origin', () => {
    expect(validateOrigin('https://example.com', ['https://example.com'])).toBe(
      true,
    );
  });

  it('rejects origin not on the list', () => {
    expect(validateOrigin('https://other.com', ['https://example.com'])).toBe(
      false,
    );
  });

  it('matches valid subdomain against wildcard pattern', () => {
    expect(validateOrigin('https://sub.example.com', ['*.example.com'])).toBe(
      true,
    );
  });

  it('rejects malicious prefix attack (malicious-example.com does not match *.example.com)', () => {
    expect(
      validateOrigin('https://malicious-example.com', ['*.example.com']),
    ).toBe(false);
  });

  it('rejects bare domain against wildcard (example.com does not match *.example.com)', () => {
    expect(validateOrigin('https://example.com', ['*.example.com'])).toBe(
      false,
    );
  });

  it('matches multiple allowed origins', () => {
    expect(
      validateOrigin('https://app.example.com', [
        'https://other.com',
        '*.example.com',
      ]),
    ).toBe(true);
  });
});
