import { describe, expect, it } from 'vitest';

import { formatUsd } from '../format-usd';

describe('formatUsd', () => {
  it('shows an AI cost in dollars, which is what the pricing table is in', () => {
    expect(formatUsd(12.345)).toBe('$12.35');
    expect(formatUsd(0.00042, 4)).toBe('$0.0004');
    expect(formatUsd(0, 4)).toBe('$0.0000');
  });

  it('never shows a euro sign', () => {
    expect(formatUsd(1)).not.toContain('€');
  });
});
