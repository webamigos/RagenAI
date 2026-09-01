import { describe, it, expect } from 'vitest';
import {
  supportsReasoningEffort,
  isReasoningModel,
  DEEP_THINKING_DEFAULT_MODEL,
} from '../config';

describe('config helpers — reasoning', () => {
  it('flags GPT-OSS as supporting reasoning_effort', () => {
    expect(supportsReasoningEffort('gpt-oss-120b')).toBe(true);
    expect(isReasoningModel('gpt-oss-120b')).toBe(true);
  });

  it('does not flag Claude as supporting reasoning_effort even though it reasons', () => {
    expect(isReasoningModel('claude-sonnet-4-6')).toBe(true);
    expect(supportsReasoningEffort('claude-sonnet-4-6')).toBe(false);
  });

  it('returns false for unknown models', () => {
    expect(supportsReasoningEffort('made-up-model')).toBe(false);
  });

  it('exposes the default deep-thinking model id', () => {
    expect(DEEP_THINKING_DEFAULT_MODEL).toBe('gpt-oss-120b');
  });
});
