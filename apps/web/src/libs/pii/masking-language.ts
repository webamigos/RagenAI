/**
 * The language Presidio analyses a user's message as.
 *
 * A constant rather than the literal it replaces, because as of C3 there are
 * two callers and they must agree. The chat path masks a turn; the guardrail
 * policy trial masks the text a platform administrator pastes into the rule
 * form, so that the judge scores the same string a turn would hand it.
 *
 * Presidio's recognizers are per language — spaCy `pl_core_news_md` against
 * Polish text, and an analyzer asked for `en` over the same text finds close
 * to nothing. Two callers naming their own language is therefore not a
 * cosmetic duplication: it is a trial that masks differently from the turn it
 * is meant to predict, and an operator tuning a policy against the difference.
 *
 * Still a constant rather than a per-request choice. It has been `'pl'` since
 * masking shipped, and making it configurable is a separate decision with its
 * own migration — a request-scoped language that defaulted to `'pl'` would
 * read as supported while every recognizer set but one went untested.
 */
export const PII_MASKING_LANGUAGE = 'pl';
