/**
 * LiteLLM raises these messages when the organization's virtual key
 * hits its monthly budget cap. The exact wording comes from LiteLLM's
 * budget middleware — kept in one place so both the chat and chatbot
 * surfaces can translate it to friendly errors.
 */
export const BUDGET_MARKERS = [
  'Budget has been exceeded',
  'ExceededBudget',
] as const;

export const isBudgetExceededError = (err: unknown): boolean => {
  const msg = err instanceof Error ? err.message : String(err);
  return BUDGET_MARKERS.some((marker) => msg.includes(marker));
};
