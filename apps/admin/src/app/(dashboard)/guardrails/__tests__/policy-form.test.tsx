import {
  DEFAULT_POLICY_THRESHOLD,
  MAX_ACTIVE_LLM_POLICIES,
  OUTPUT_POLICY_LATENCY_NOTICE,
} from '@ragenai/guardrails/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// Type-only, so the `vi.mock` below does not affect it.
import type { GuardrailRow } from '../actions';

vi.mock('../actions', () => ({
  createGuardrailAction: vi.fn(),
  updateGuardrailAction: vi.fn(),
}));
vi.mock('../policy-trial', () => ({ testPolicyAction: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { GuardrailForm } = await import('../components/GuardrailForm');
const { GuardrailsList } = await import('../components/GuardrailsList');

const base: Omit<GuardrailRow, 'kind'> = {
  publicId: 'gr-1',
  key: null,
  name: 'No competitor pricing',
  description: null,
  stage: 'INPUT' as const,
  action: 'LOG' as const,
  enabled: false,
  severity: 'warn' as const,
  pattern: null,
  patternIsRegex: false,
  policy: null,
  threshold: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  overrideCount: 0,
};

const policyRule: GuardrailRow = {
  ...base,
  kind: 'LLM_POLICY',
  policy: 'Never discuss a competitor’s pricing.',
  threshold: 0.85,
};

const patternRule: GuardrailRow = {
  ...base,
  kind: 'PATTERN',
  pattern: '\\d{4}',
  patternIsRegex: true,
};

const render = (rule: GuardrailRow) =>
  renderToStaticMarkup(<GuardrailForm rule={rule} onClose={() => {}} />);

describe('the policy editor', () => {
  it('offers the prose the judge reads, with the rule’s own text in it', () => {
    const markup = render(policyRule);

    expect(markup).toContain('guardrail-policy');
    expect(markup).toContain('Never discuss a competitor’s pricing.');
  });

  /**
   * The caveat an operator otherwise discovers from a policy that never
   * fires: the input stage runs downstream of Presidio, so a policy about
   * personal data is judging a placeholder rather than a value.
   */
  it('says the judge reads text whose personal data is already masked', () => {
    expect(render(policyRule)).toContain('PERSON_1');
  });

  /**
   * The threshold's default is shown rather than assumed. An empty field means
   * "the rule names none", and an operator who cannot see what that resolves
   * to cannot tell a deliberate 0.5 from an accidental one.
   */
  it('shows the default threshold where the field is empty', () => {
    const markup = render({ ...policyRule, threshold: null });

    expect(markup).toContain(`placeholder="${DEFAULT_POLICY_THRESHOLD}"`);
  });

  it('shows a stored threshold rather than the default', () => {
    expect(render(policyRule)).toContain('value="0.85"');
  });

  /**
   * Where the operator meets the cap, rather than in a runbook — and the
   * number comes from the constant the loop enforces, so the page cannot
   * promise an allowance the runtime does not give.
   */
  it('states the cap on the form itself', () => {
    expect(render(policyRule)).toContain(String(MAX_ACTIVE_LLM_POLICIES));
  });

  it('offers the trial box, because a policy cannot be read off the form', () => {
    expect(render(policyRule)).toContain('Test this policy');
  });
});

describe('a scored built-in', () => {
  const jailbreak: GuardrailRow = {
    ...base,
    kind: 'BUILT_IN',
    key: 'jailbreak-detection',
    name: 'Jailbreak detection',
    threshold: 0.6,
  };

  const moderation: GuardrailRow = {
    ...base,
    kind: 'BUILT_IN',
    key: 'content-moderation',
    name: 'Content moderation',
  };

  /**
   * The column the resolver has always read and nothing could write. Before
   * C4 `jailbreak-detection` ran at whatever sensitivity the migration seeded,
   * with no way to change it short of SQL.
   */
  it('offers the threshold its detector actually fires at', () => {
    const markup = render(jailbreak);

    expect(markup).toContain('guardrail-threshold');
    expect(markup).toContain('value="0.6"');
  });

  it('says the question is fixed and only the sensitivity is theirs', () => {
    // Otherwise it is a number an operator avoids touching, because they
    // cannot tell what else it changes.
    expect(render(jailbreak)).toContain('fixed');
  });

  /**
   * Per **key**, not per kind — the distinction `SCORED_BUILT_IN_KEYS` exists
   * for. `content-moderation` is a `BUILT_IN` whose provider answers with a
   * flag, so a threshold field on it would be a number that changes nothing.
   */
  it('is not offered for a built-in whose verdict is a flag', () => {
    expect(render(moderation)).not.toContain('guardrail-threshold');
  });

  it.each([
    ['the policy field', 'guardrail-policy'],
    ['the trial box', 'Test this policy'],
    ['the cap notice', 'counts against that allowance'],
  ])('does not show %s — its question is code, not prose', (_l, fragment) => {
    expect(render(jailbreak)).not.toContain(fragment);
  });
});

describe('a pattern rule', () => {
  /**
   * Both directions, so a form that rendered every field for every kind would
   * fail. Only asserting the policy fields appear for a policy rule passes
   * just as well when they appear always.
   */
  it.each([
    ['the policy field', 'guardrail-policy'],
    ['the trial box', 'Test this policy'],
    ['the cap notice', 'counts against that allowance'],
    ['the threshold field', 'guardrail-threshold'],
  ])('does not show %s', (_label, fragment) => {
    expect(render(patternRule)).not.toContain(fragment);
  });

  it('still shows its own pattern field', () => {
    expect(render(patternRule)).toContain('guardrail-pattern');
  });
});

describe('the rule list', () => {
  const list = (rule: GuardrailRow) =>
    renderToStaticMarkup(<GuardrailsList rules={[rule]} hits={{}} />);

  /**
   * A policy rule used to render the word `LLM_POLICY` in the column where a
   * pattern rule shows its pattern. That names the kind and says nothing about
   * the rule — and with three policies allowed per organization, a list you
   * cannot tell apart is a list you read by opening every row.
   */
  it('shows what the policy says, not the name of the kind', () => {
    const markup = list(policyRule);

    expect(markup).toContain('Never discuss');
    expect(markup).not.toContain('>LLM_POLICY<');
  });

  it('truncates a long policy rather than filling the column', () => {
    const markup = list({ ...policyRule, policy: 'x'.repeat(400) });

    // The *visible* text, not the markup: the whole policy stays in the
    // `title` attribute on purpose, so hovering shows it. Asserting over the
    // markup would fail on the tooltip and call the truncation broken.
    const visible = /<span class="text-xs italic"[^>]*>([^<]*)<\/span>/.exec(
      markup,
    )?.[1];

    expect(visible).toBeDefined();
    expect(visible!.length).toBeLessThan(120);
    expect(visible).toMatch(/…$/);
    // And the tooltip does carry the whole thing, so the truncation is a
    // display choice rather than the list dropping information.
    expect(markup).toContain(`title="${'x'.repeat(400)}"`);
  });

  it('shows the threshold a scored rule fires at, default included', () => {
    expect(list({ ...policyRule, threshold: null })).toContain(
      `fires at ${DEFAULT_POLICY_THRESHOLD}`,
    );
    expect(list(policyRule)).toContain('fires at 0.85');
  });

  it('still shows a pattern rule’s pattern, and no threshold', () => {
    const markup = list(patternRule);

    expect(markup).toContain(patternRule.pattern!);
    expect(markup).not.toContain('fires at');
  });
});

/**
 * The one thing about an output policy an operator cannot see from the form.
 *
 * A judged rule on the output side holds the whole answer until a model has
 * read it, so the answer appears at once instead of word by word. That is a
 * change to how the product feels rather than to what it allows — which is
 * exactly the kind of thing that comes back as "chat got slow" from somebody
 * who never opened this page.
 */
describe('the latency an output policy costs', () => {
  it('says so on a policy that runs on the output stage', () => {
    const markup = render({ ...policyRule, stage: 'OUTPUT' });

    expect(markup).toContain(OUTPUT_POLICY_LATENCY_NOTICE.slice(0, 40));
  });

  it('says so on a BOTH rule, which runs there too', () => {
    const markup = render({ ...policyRule, stage: 'BOTH' });

    expect(markup).toContain(OUTPUT_POLICY_LATENCY_NOTICE.slice(0, 40));
  });

  it('stays quiet on an input policy, where it would be false', () => {
    const markup = render({ ...policyRule, stage: 'INPUT' });

    expect(markup).not.toContain(OUTPUT_POLICY_LATENCY_NOTICE.slice(0, 40));
  });

  it('stays quiet on a pattern rule, which streams either way', () => {
    const markup = render({ ...patternRule, stage: 'OUTPUT' });

    expect(markup).not.toContain(OUTPUT_POLICY_LATENCY_NOTICE.slice(0, 40));
  });
});
