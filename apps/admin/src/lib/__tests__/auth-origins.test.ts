import { describe, it, expect } from 'vitest';

import { adminTrustedOrigins, LOCAL_ADMIN_ORIGIN } from '../auth-origins';

describe('adminTrustedOrigins', () => {
  it('trusts this app on localhost even when BETTER_AUTH_URL names another app', () => {
    // The defect: one root `.env.local` serves every app, `BETTER_AUTH_URL`
    // holds a single origin, and it is apps/web's. Signing in on :3200 then
    // failed with "Invalid origin" and nothing named the port or the variable.
    const origins = adminTrustedOrigins({
      BETTER_AUTH_URL: 'http://localhost:3000',
      NODE_ENV: 'development',
    });

    expect(origins).toContain(LOCAL_ADMIN_ORIGIN);
    expect(origins).toContain('http://localhost:3000');
  });

  it('leaves localhost off the list in production', () => {
    const origins = adminTrustedOrigins({
      BETTER_AUTH_URL: 'https://admin.example.com',
      NODE_ENV: 'production',
    });

    expect(origins).toEqual(['https://admin.example.com']);
  });

  it('accepts extra origins for a deployment behind a proxy', () => {
    const origins = adminTrustedOrigins({
      ADMIN_TRUSTED_ORIGINS:
        'https://admin.example.com, https://ops.example.com',
      NODE_ENV: 'production',
    });

    expect(origins).toEqual([
      'https://admin.example.com',
      'https://ops.example.com',
    ]);
  });

  it('reduces a url to its origin, so a path in the variable still matches', () => {
    expect(
      adminTrustedOrigins({
        BETTER_AUTH_URL: 'https://admin.example.com/api/auth',
        NODE_ENV: 'production',
      }),
    ).toEqual(['https://admin.example.com']);
  });

  it('drops a malformed value instead of refusing to boot', () => {
    // This runs at module load. Throwing here would take the panel down over a
    // stray character — a worse failure than the one being fixed.
    expect(
      adminTrustedOrigins({
        BETTER_AUTH_URL: 'not a url',
        NODE_ENV: 'production',
      }),
    ).toEqual([]);
  });

  it('does not repeat an origin named twice', () => {
    expect(
      adminTrustedOrigins({
        ADMIN_TRUSTED_ORIGINS: 'https://admin.example.com',
        BETTER_AUTH_URL: 'https://admin.example.com',
        NODE_ENV: 'production',
      }),
    ).toEqual(['https://admin.example.com']);
  });
});
