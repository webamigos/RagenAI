import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
const routeDescribesItself = vi.hoisted(() => vi.fn());
vi.mock('@ragenai/llm-gateway', () => ({ routeDescribesItself }));

import { calculateCost } from '../ai-pricing';

describe('calculateCost for a model the route table describes itself', () => {
  it('is zero, even when the id aliases a priced cloud model', () => {
    // The appliance routes `gemini-2.5-flash` (priced) to a local model.
    routeDescribesItself.mockReturnValue(true);
    expect(
      calculateCost('litellm', 'gemini-2.5-flash', 1_000_000, 1_000_000),
    ).toBe(0);
  });

  it('is the table price for an ordinary route', () => {
    routeDescribesItself.mockReturnValue(false);
    expect(
      calculateCost('litellm', 'gemini-2.5-flash', 1_000_000, 1_000_000),
    ).toBeGreaterThan(0);
  });
});
