import { describe, it, expect } from 'vitest';
import { piiPolicySchema } from '../pii-policy-schema';

describe('piiPolicySchema', () => {
  it('accepts NONE', () => {
    expect(piiPolicySchema.safeParse('NONE').success).toBe(true);
  });

  it('accepts TOXIC_ONLY', () => {
    expect(piiPolicySchema.safeParse('TOXIC_ONLY').success).toBe(true);
  });

  it('accepts STRICT', () => {
    expect(piiPolicySchema.safeParse('STRICT').success).toBe(true);
  });

  it('accepts null', () => {
    expect(piiPolicySchema.safeParse(null).success).toBe(true);
  });

  it('accepts undefined', () => {
    expect(piiPolicySchema.safeParse(undefined).success).toBe(true);
  });

  it('rejects lowercase none', () => {
    expect(piiPolicySchema.safeParse('none').success).toBe(false);
  });

  it('rejects arbitrary string', () => {
    expect(piiPolicySchema.safeParse('MEDIUM').success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(piiPolicySchema.safeParse('').success).toBe(false);
  });
});
