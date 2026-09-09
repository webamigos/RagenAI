import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { StatusBadge, type StatusBadgeState } from '../status-badge';

const STATES: StatusBadgeState[] = ['ready', 'processing', 'failed', 'queued'];

describe('StatusBadge', () => {
  it('always carries a word, so state never rests on colour alone', () => {
    // The panel rule, and the reason this component takes a required label
    // rather than deriving one: a colour-blind reader, a greyscale print and a
    // screenshot in a ticket all have to work.
    for (const state of STATES) {
      const { unmount } = render(<StatusBadge state={state} label={state} />);
      expect(screen.getByText(state)).toBeInTheDocument();
      unmount();
    }
  });

  it('uses the readable label colour on each tint, not the base hue', () => {
    // `text-pending` on `bg-pending-tint` measures 1.98:1 and `text-ready` on
    // its tint 3.07:1 — both below AA, and both were shipping. The `-strong`
    // tokens are the same hues dark enough to read at 11px.
    render(<StatusBadge state="processing" label="Processing" />);
    const light = (el: HTMLElement) =>
      el.className.split(/\s+/).filter((c) => !c.startsWith('dark:'));

    expect(light(screen.getByText('Processing'))).toContain(
      'text-pending-strong',
    );
    // The bare hue is the one that measured 1.98:1. `dark:text-pending` is
    // fine and stays — on a dark ground the light amber is the readable half.
    expect(light(screen.getByText('Processing'))).not.toContain('text-pending');

    render(<StatusBadge state="ready" label="Ready" />);
    expect(light(screen.getByText('Ready'))).toContain('text-ready-strong');
    expect(light(screen.getByText('Ready'))).not.toContain('text-ready');
  });

  it('exposes the state as data, so a test never asserts on a colour', () => {
    // The trap recorded in
    // docs/lessons/an-e2e-locator-keyed-to-a-colour-class-breaks-when-colours-move.md
    render(<StatusBadge state="failed" label="Failed" data-testid="s" />);
    expect(screen.getByTestId('s')).toHaveAttribute('data-state', 'failed');
  });

  it('hides the dot from assistive tech, since the word already says it', () => {
    const { container } = render(<StatusBadge state="ready" label="Ready" />);
    const dot = container.querySelector('[aria-hidden="true"]');
    expect(dot).not.toBeNull();
    expect(dot?.className).toContain('bg-ready');
  });

  it('pulses only while something is actually happening', () => {
    const { container: processing } = render(
      <StatusBadge state="processing" label="Processing" />,
    );
    expect(processing.innerHTML).toContain('animate-pulse');

    for (const state of ['ready', 'failed', 'queued'] as StatusBadgeState[]) {
      const { container } = render(<StatusBadge state={state} label="x" />);
      expect(container.innerHTML).not.toContain('animate-pulse');
    }
  });

  it('takes no percentage', () => {
    // Q4 of the functional-gaps spec removed it from the contract: ingest
    // reports no progress that means anything, so a number here would be
    // confident and wrong. If this assertion is deleted, read that decision
    // first — it is a product decision, not an omission.
    const props = Object.keys(
      StatusBadge as unknown as Record<string, unknown>,
    );
    expect(props).not.toContain('percentage');
    // And the rendered output carries no digits of its own.
    const { container } = render(
      <StatusBadge state="processing" label="Processing" />,
    );
    expect(container.textContent).toBe('Processing');
  });

  it('merges a caller className without losing its own', () => {
    render(<StatusBadge state="queued" label="Queued" className="ml-2" />);
    const el = screen.getByText('Queued');
    expect(el.className).toContain('ml-2');
    expect(el.className).toContain('bg-muted');
  });
});
