import { expect, it } from 'vitest';
import { shouldShowGraphLabel } from '../components/graph-label-visibility';
it('hides distant labels while preserving selected, hovered and neighbouring labels', () => {
  expect(shouldShowGraphLabel(1, false)).toBe(false);
  expect(shouldShowGraphLabel(0.7, false)).toBe(true);
  expect(shouldShowGraphLabel(0.2, false)).toBe(true);
  expect(shouldShowGraphLabel(2, true)).toBe(true);
});
