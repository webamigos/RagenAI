export type ChainErrorCode =
  | 'moderation-error'
  /**
   * A guardrail rule with `action: 'BLOCK'` matched the input.
   *
   * Distinct from `moderation-error`: that one means a provider flagged the
   * content, this one means a rule an administrator wrote refused the turn.
   * `apps/api` has no locale layer, so this code is what the caller receives
   * and renders — which is the whole reason it has to be specific.
   */
  | 'guardrail-blocked'
  | 'api-key-error'
  | 'unknown-error'
  | 'llm-api-error';
