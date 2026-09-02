import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { AlertStatus } from '../AlertStatus';

/**
 * Rendered to a string rather than into a DOM: this is a server component with
 * no interactivity, and the whole question is which sentence it prints.
 */
function render(unresolvedCritical = 0): string {
  return renderToStaticMarkup(
    <AlertStatus unresolvedCritical={unresolvedCritical} />,
  );
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe('when no recipients are configured', () => {
  /**
   * The state this component exists for: alerting is off, and before this it
   * looked identical to alerting being on.
   */
  it('says nobody is being alerted', () => {
    vi.stubEnv('SECURITY_ALERT_EMAIL', '');

    const html = render();

    expect(html).toContain('Nobody is being alerted');
    expect(html).toContain('SECURITY_ALERT_EMAIL');
  });

  it.each([
    ['empty', ''],
    ['only whitespace and commas', ' , , '],
  ])('treats %s as off', (_label, value) => {
    vi.stubEnv('SECURITY_ALERT_EMAIL', value);

    expect(render()).toContain('Nobody is being alerted');
  });

  it('says events are still recorded, so the reader does not assume data loss', () => {
    vi.stubEnv('SECURITY_ALERT_EMAIL', '');

    expect(render()).toContain('still recorded');
  });
});

describe('when recipients are configured', () => {
  it('says alerting is on and lists them', () => {
    vi.stubEnv('SECURITY_ALERT_EMAIL', 'ops@example.com, sec@example.com');

    const html = render();

    expect(html).toContain('Alerting is on');
    expect(html).toContain('ops@example.com, sec@example.com');
  });

  it('trims whitespace around addresses', () => {
    vi.stubEnv('SECURITY_ALERT_EMAIL', '  ops@example.com  ');

    expect(render()).toContain('>ops@example.com<');
  });

  it('reports the configured threshold', () => {
    vi.stubEnv('SECURITY_ALERT_EMAIL', 'ops@example.com');
    vi.stubEnv('SECURITY_ALERT_SEVERITY', 'warn');

    expect(render()).toContain('warn');
  });

  it('defaults the threshold to critical when unset', () => {
    vi.stubEnv('SECURITY_ALERT_EMAIL', 'ops@example.com');
    vi.stubEnv('SECURITY_ALERT_SEVERITY', '');

    expect(render()).toContain('critical');
  });

  /**
   * `severity-threshold.ts` in apps/web falls back to `critical` for an
   * unrecognised value rather than erroring, so a typo silently narrows
   * alerting to the loudest events only. Saying so is the point of the panel.
   */
  it('flags a threshold that is not a severity', () => {
    vi.stubEnv('SECURITY_ALERT_EMAIL', 'ops@example.com');
    vi.stubEnv('SECURITY_ALERT_SEVERITY', 'warning');

    const html = render();

    expect(html).toContain('not a severity');
    expect(html).toContain('warning');
  });

  it('accepts a threshold in a different case', () => {
    vi.stubEnv('SECURITY_ALERT_EMAIL', 'ops@example.com');
    vi.stubEnv('SECURITY_ALERT_SEVERITY', 'WARN');

    expect(render()).not.toContain('not a severity');
  });
});

describe('unresolved criticals', () => {
  it('shows the count when there are any', () => {
    vi.stubEnv('SECURITY_ALERT_EMAIL', 'ops@example.com');

    expect(render(3)).toContain('3 unresolved critical');
  });

  it('says nothing when there are none', () => {
    vi.stubEnv('SECURITY_ALERT_EMAIL', 'ops@example.com');

    expect(render(0)).not.toContain('unresolved critical');
  });
});
