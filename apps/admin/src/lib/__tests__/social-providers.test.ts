import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getGoogleCredentials,
  isGoogleSignInConfigured,
} from '../social-providers';

/**
 * Five lines of environment reading, and the only place that decides whether
 * this installation has Google sign-in at all. Both callers — the Better Auth
 * provider registration and the login page's button — trust it, and neither
 * would fail loudly if it started answering wrongly: the panel would just
 * offer a button that cannot work, which is the bug this module exists to
 * stop.
 */
describe('getGoogleCredentials', () => {
  const original = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  };

  beforeEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });

  afterEach(() => {
    process.env.GOOGLE_CLIENT_ID = original.clientId;
    process.env.GOOGLE_CLIENT_SECRET = original.clientSecret;
    if (original.clientId === undefined) {
      delete process.env.GOOGLE_CLIENT_ID;
    }
    if (original.clientSecret === undefined) {
      delete process.env.GOOGLE_CLIENT_SECRET;
    }
  });

  it('returns the pair when both variables are set', () => {
    process.env.GOOGLE_CLIENT_ID = 'id.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';

    expect(getGoogleCredentials()).toEqual({
      clientId: 'id.apps.googleusercontent.com',
      clientSecret: 'secret',
    });
    expect(isGoogleSignInConfigured()).toBe(true);
  });

  it('returns null when neither is set', () => {
    expect(getGoogleCredentials()).toBeNull();
    expect(isGoogleSignInConfigured()).toBe(false);
  });

  // Half-configured is the state that produced a Google error page rather than
  // a Ragen one: the provider registered, the button showed, the exchange
  // failed at Google with `invalid_client`.
  it('returns null when only the client ID is set', () => {
    process.env.GOOGLE_CLIENT_ID = 'id.apps.googleusercontent.com';

    expect(getGoogleCredentials()).toBeNull();
  });

  it('returns null when only the client secret is set', () => {
    process.env.GOOGLE_CLIENT_SECRET = 'secret';

    expect(getGoogleCredentials()).toBeNull();
  });

  // `apps/admin/.env.example` ships both declared as `""`. A copied env file
  // that was never filled in must not read as configured.
  it('treats empty and whitespace-only values as unset', () => {
    process.env.GOOGLE_CLIENT_ID = '';
    process.env.GOOGLE_CLIENT_SECRET = '';
    expect(getGoogleCredentials()).toBeNull();

    process.env.GOOGLE_CLIENT_ID = '   ';
    process.env.GOOGLE_CLIENT_SECRET = '\t';
    expect(getGoogleCredentials()).toBeNull();
  });

  it('trims surrounding whitespace off values it accepts', () => {
    process.env.GOOGLE_CLIENT_ID = '  id.apps.googleusercontent.com  ';
    process.env.GOOGLE_CLIENT_SECRET = ' secret ';

    expect(getGoogleCredentials()).toEqual({
      clientId: 'id.apps.googleusercontent.com',
      clientSecret: 'secret',
    });
  });
});
