import { DEFAULT_POLICY_THRESHOLD } from '@ragenai/guardrails/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../org-actions', () => ({ setGuardrailOverrideAction: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import type {
  OrgGuardrailRow,
  OrgGuardrailsView as ViewData,
} from '../org-actions';

const { OrgGuardrailsView } = await import('../components/OrgGuardrailsView');

const row = (over: Partial<OrgGuardrailRow> = {}): OrgGuardrailRow => ({
  publicId: 'gr-1',
  key: 'jailbreak-detection',
  name: 'Jailbreak detection',
  kind: 'BUILT_IN',
  stage: 'INPUT',
  enabled: true,
  action: 'BLOCK',
  threshold: 0.7,
  severity: 'warn',
  isPlatformRule: true,
  sources: {
    enabled: 'platform-rule',
    action: 'platform-rule',
    threshold: 'platform-rule',
  },
  override: null,
  ...over,
});

const render = (rows: OrgGuardrailRow[], over: Partial<ViewData> = {}) =>
  renderToStaticMarkup(
    <OrgGuardrailsView
      organizationId="org-a"
      data={{ rules: rows, isOnPremiseInstallation: false, ...over }}
    />,
  );

describe('what an organization can adjust', () => {
  /**
   * The one an organization is most likely to want: "keep the platform's rule,
   * but only log it for us" is the whole reason an override exists, and the
   * resolver has honoured it since Phase A with no control able to set it.
   */
  it('offers an action override, naming what it would inherit', () => {
    const markup = render([row()]);

    expect(markup).toContain('On a hit');
    expect(markup).toContain('Inherit (BLOCK)');
    expect(markup).toContain('>LOG<');
  });

  it('offers only the actions the kind can carry out', () => {
    // MASK needs a span to replace, and a built-in returns a verdict over the
    // whole text. Offering it would be offering a choice the action refuses.
    expect(render([row()])).not.toContain('>MASK<');
  });

  it('offers MASK on a pattern rule, whose match does carry a span', () => {
    const markup = render([
      row({ kind: 'PATTERN', key: null, name: 'Card numbers' }),
    ]);

    expect(markup).toContain('>MASK<');
  });

  it('offers a threshold on a scored rule, seeded from the override', () => {
    const markup = render([
      row({
        override: {
          enabled: null,
          action: null,
          threshold: 0.4,
          isLegacyOnPremise: false,
        },
      }),
    ]);

    expect(markup).toContain('Fires at');
    expect(markup).toContain('value="0.4"');
  });

  /**
   * An empty box must not read as "no threshold". What it shows is what the
   * rule inherits, which is the number actually in force.
   */
  it('shows the inherited threshold as the placeholder when none is set', () => {
    expect(render([row({ threshold: 0.55 })])).toContain('placeholder="0.55"');
  });

  it('falls back to the judge default when the rule names none either', () => {
    expect(render([row({ threshold: null })])).toContain(
      `placeholder="${DEFAULT_POLICY_THRESHOLD}"`,
    );
  });

  /**
   * Per key, not per kind — the same distinction the platform form makes.
   * `content-moderation` asks a provider endpoint that answers with a flag.
   */
  it('offers no threshold where a verdict is not a score', () => {
    const markup = render([
      row({
        key: 'content-moderation',
        name: 'Content moderation',
        kind: 'BUILT_IN',
      }),
    ]);

    expect(markup).toContain('On a hit');
    expect(markup).not.toContain('Fires at');
  });

  it('offers nothing at all on an organization’s own rule', () => {
    const markup = render([row({ isPlatformRule: false })]);

    expect(markup).toContain('Own rule');
    expect(markup).not.toContain('On a hit');
    expect(markup).not.toContain('Fires at');
  });
});
