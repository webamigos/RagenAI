import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ScoreBadge } from '../ScoreBadge';

describe('ScoreBadge', () => {
  // Shown in Version history and Optimize. The state colours belong to
  // document and job state, so a score uses none of them at any value.
  it.each([90, 60, 10])('shows %i out of 100 with no state colour', (total) => {
    const { container } = render(<ScoreBadge total={total} />);

    expect(container.textContent).toBe(`${total}/100`);
    expect(container.innerHTML).not.toMatch(
      /ready|pending|crimson|destructive/,
    );
    expect(
      (container.querySelector('[style]') as HTMLElement).style.width,
    ).toBe(`${total}%`);
  });
});
