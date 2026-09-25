import { describe, expect, it } from 'vitest';

import { formatUsd } from '../format';

describe('formatUsd', () => {
  it('shows AI spend in dollars, as the organization page already did', () => {
    expect(formatUsd(12.345)).toBe('$12.35');
    expect(formatUsd(0.00042, 4)).toBe('$0.0004');
    expect(formatUsd(1234.5)).toBe('$1,234.50');
  });
});
