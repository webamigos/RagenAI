const { routeDescribesItself } = vi.hoisted(() => ({
  routeDescribesItself: vi.fn<(model: string) => boolean>(),
}));
vi.mock('@ragenai/llm-gateway', () => ({ routeDescribesItself }));

import { calculateCost } from './ai-pricing.js';

describe('calculateCost for a model the route table describes itself', () => {
  it('is zero, even when the id aliases a priced cloud model', () => {
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
