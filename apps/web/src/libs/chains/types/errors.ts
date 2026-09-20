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
  | 'rate-limit-exceeded';
