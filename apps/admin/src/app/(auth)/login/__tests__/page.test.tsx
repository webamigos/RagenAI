import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

import LoginPage from '../page';

/**
 * The end of the wire: the environment the panel was started with decides what
 * the login page offers. `login-form.test.tsx` covers the prop; this covers
 * the only thing that reads the environment and passes it.
 *
 * Worth its own test because the failure is invisible. A page that always says
 * `googleEnabled={true}` looks correct on the developer's machine, where the
 * variables happen to be set.
 */
describe('LoginPage', () => {
  const original = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  };

  function restore(
    name: 'GOOGLE_CLIENT_ID' | 'GOOGLE_CLIENT_SECRET',
    value: string | undefined,
  ) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }

  beforeEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });

  afterEach(() => {
    restore('GOOGLE_CLIENT_ID', original.clientId);
    restore('GOOGLE_CLIENT_SECRET', original.clientSecret);
  });

  it('offers Google when both credentials are in the environment', () => {
    process.env.GOOGLE_CLIENT_ID = 'id.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';

    expect(renderToStaticMarkup(LoginPage())).toContain('Sign in with Google');
  });

  it('offers only password sign-in when they are not', () => {
    const markup = renderToStaticMarkup(LoginPage());

    expect(markup).not.toContain('Sign in with Google');
    expect(markup).toContain('id="password"');
  });
});
