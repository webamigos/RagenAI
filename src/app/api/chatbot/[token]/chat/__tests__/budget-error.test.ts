import { describe, it, expect } from 'vitest';
import { isBudgetExceededError, BUDGET_MARKERS } from '../budget-error';

describe('isBudgetExceededError', () => {
  it('recognises every BUDGET_MARKERS entry as a budget error', () => {
    for (const marker of BUDGET_MARKERS) {
      expect(isBudgetExceededError(new Error(`${marker}: details`))).toBe(true);
    }
  });

  it('recognises the "Budget has been exceeded" LiteLLM message', () => {
    const err = new Error('Budget has been exceeded for organization org-1');
    expect(isBudgetExceededError(err)).toBe(true);
  });

  it('recognises the legacy "ExceededBudget" marker', () => {
    const err = new Error('ExceededBudget: monthly limit reached');
    expect(isBudgetExceededError(err)).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isBudgetExceededError(new Error('Connection timeout'))).toBe(false);
    expect(isBudgetExceededError(new Error('Invalid API key'))).toBe(false);
  });

  it('handles non-Error thrown values by stringifying them', () => {
    expect(isBudgetExceededError('Budget has been exceeded')).toBe(true);
    expect(isBudgetExceededError({ message: 'nope' })).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isBudgetExceededError(null)).toBe(false);
    expect(isBudgetExceededError(undefined)).toBe(false);
  });
});
