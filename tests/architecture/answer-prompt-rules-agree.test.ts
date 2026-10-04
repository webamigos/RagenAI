import { describe, expect, it } from 'vitest';

import * as api from '../../apps/api/src/chains/basic-rag/config';
import * as web from '../../apps/web/src/libs/chains/basic-rag/config';

/**
 * apps/api keeps its own copy of apps/web's answer prompt (ADR-21), and the
 * grounding rule — whether the model may answer from its own knowledge — is
 * the line a customer's public chatbot depends on most. Strict grounding
 * (spec 2026-10-03-retrieval-claims-match-the-product-before-launch, Phase
 * C2) changed that line in both copies; an assistant that refuses in the
 * panel and answers from general knowledge through the API is the drift this
 * catches.
 *
 * It compares the top-level rule list, once per grounding variant, after the
 * rule is filled in the way `buildRagMessages` fills it. The citation
 * sub-bullets are left out on purpose: apps/web cites by `source` number and
 * apps/api by file name, a difference that predates this test and is not a
 * grounding rule.
 */
type Config = typeof web;

function ruleList(config: Config, variant: keyof Config['GROUNDING_RULES']) {
  const filled = config.systemTemplates.answerChain.replace(
    '{grounding_rule}',
    config.GROUNDING_RULES[variant],
  );
  const rules = filled.match(/<rules>([\s\S]*?)<\/rules>/);
  if (!rules) {
    throw new Error('the answer prompt has no <rules> block');
  }
  return rules[1]
    .split('\n')
    .filter((line) => /^ {6}- /.test(line))
    .map((line) => line.trim());
}

describe('the web and api answer prompts carry the same rules', () => {
  it('declares the same two grounding rules', () => {
    expect(api.GROUNDING_RULES).toEqual(web.GROUNDING_RULES);
  });

  it.each(['default', 'strict'] as const)(
    'lists the same rules with the %s grounding rule',
    (variant) => {
      const webRules = ruleList(web, variant);
      expect(webRules.length).toBeGreaterThan(5);
      expect(webRules).toContain(`- ${web.GROUNDING_RULES[variant]}`);
      expect(ruleList(api as Config, variant)).toEqual(webRules);
    },
  );
});
