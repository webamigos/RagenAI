import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

import { LoginForm } from '../login-form';

function render(googleEnabled: boolean): string {
  return renderToStaticMarkup(<LoginForm googleEnabled={googleEnabled} />);
}

/**
 * The prop is the whole point of splitting this file off `page.tsx`: the
 * server reads the environment, the client renders what it is told. Nothing
 * else notices if the wiring breaks — a button that should not be there looks
 * exactly like one that should, until somebody clicks it and lands on a Google
 * error page.
 */
describe('LoginForm', () => {
  it('offers the Google button when the provider is configured', () => {
    const markup = render(true);

    expect(markup).toContain('Sign in with Google');
  });

  it('omits the Google button when the provider is not configured', () => {
    const markup = render(false);

    expect(markup).not.toContain('Sign in with Google');
  });

  // A lone "or" under the password form reads as a missing option rather than
  // an install that never had one.
  it('omits the "or" divider along with the button', () => {
    expect(render(true)).toContain('or');
    expect(render(false)).not.toContain('>or<');
  });

  it('keeps password sign-in either way', () => {
    for (const markup of [render(true), render(false)]) {
      expect(markup).toContain('id="email"');
      expect(markup).toContain('id="password"');
      expect(markup).toContain('Sign in with your platform administrator');
    }
  });
});
