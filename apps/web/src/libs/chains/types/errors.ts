export type ChainErrorCode =
  | 'moderation-error'
  /**
   * A guardrail rule with `action: 'BLOCK'` matched the input.
   *
   * Distinct from `moderation-error` on purpose. That one means one specific
   * provider flagged the text; this one means a rule an administrator wrote —
   * possibly a pattern about invoice numbers — refused the turn. Collapsing
   * them would tell a user their message was "inappropriate" when it was
   * nothing of the sort.
   */
  | 'guardrail-blocked'
  | 'api-key-error'
  | 'unknown-error'
  | 'llm-api-error'
  | 'usage-limit-exceeded'
  /**
   * The turn's model is offered but this deployment cannot call it: its route
   * names a provider whose credentials are not set, or there is no route.
   * Raised before the stream starts, so the reader sees why instead of an
   * empty answer under a full sources panel.
   */
  | 'model-not-configured'
  | 'rate-limit-exceeded';
