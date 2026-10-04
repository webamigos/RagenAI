import { GROUNDING_RULES, systemTemplates } from './config.js';
import { buildRagMessages } from './operations.js';

/**
 * The answer prompt carries exactly one of the two grounding rules: the one
 * that lets the model answer from its own knowledge, or — for an assistant set
 * to answer only from its documents — the strict one (spec
 * 2026-10-03-retrieval-claims-match-the-product-before-launch, Phase C2).
 * apps/web's copy has the same test, and
 * tests/architecture/answer-prompt-rules-agree.test.ts keeps the two in step.
 */
const CONTEXT = '<chunk file="a.pdf">The VAT rate is 23%.</chunk>';

const build = (answerFromDocumentsOnly?: boolean) =>
  buildRagMessages(
    'What is the capital of France?',
    undefined,
    CONTEXT,
    '',
    'Answer briefly.',
    '',
    undefined,
    answerFromDocumentsOnly,
  ).system;

describe('the answer prompt grounding rule', () => {
  it('is a template field, not a fixed line', () => {
    expect(systemTemplates.answerChain).toContain('- {grounding_rule}');
  });

  it.each([undefined, false])(
    "is today's rule when strict mode is %s",
    (strict) => {
      const system = build(strict);
      expect(system).toContain(`- ${GROUNDING_RULES.default}`);
      expect(system).not.toContain(GROUNDING_RULES.strict);
    },
  );

  it('is the strict rule, and only that one, when strict', () => {
    const system = build(true);
    expect(system).toContain(`- ${GROUNDING_RULES.strict}`);
    expect(system).not.toContain(GROUNDING_RULES.default);
    expect(system).not.toContain('{grounding_rule}');
  });

  it('is filled from the template, never from a chunk naming the field', () => {
    const system = buildRagMessages(
      'q',
      undefined,
      '<chunk>{grounding_rule}</chunk>',
      '',
      '',
      '',
      undefined,
      true,
    ).system;
    expect(system).toContain(`- ${GROUNDING_RULES.strict}`);
    expect(system).toContain('<chunk>{grounding_rule}</chunk>');
  });
});
