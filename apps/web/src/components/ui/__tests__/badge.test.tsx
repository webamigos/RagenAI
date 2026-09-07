import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Badge } from '../badge';

/**
 * The `ready` and `pending` variants were added while migrating away from the
 * other component library, whose Badge took a raw `color`. They exist because
 * these badges carry meaning — a connector is connected, indexing, or failing
 * — and mapping that onto `default`/`secondary` would have thrown the meaning
 * away to avoid editing a file.
 */
describe('Badge state variants', () => {
  it('renders `ready` from the palette rather than a literal green', () => {
    render(<Badge variant="ready">Connected</Badge>);

    const badge = screen.getByText('Connected');
    expect(badge).toHaveClass('bg-ready/15');
    expect(badge).toHaveAttribute('data-variant', 'ready');
  });

  it('renders `pending` from the palette rather than a literal amber', () => {
    render(<Badge variant="pending">Indexing</Badge>);

    expect(screen.getByText('Indexing')).toHaveClass('bg-pending/15');
  });

  it.each(['ready', 'pending'] as const)(
    'keeps %s legible by using the theme foreground, not a per-hue text colour',
    (variant) => {
      // A tint plus `text-foreground` is what guarantees contrast in both
      // themes without a darker companion token for every status hue.
      render(<Badge variant={variant}>Label</Badge>);

      expect(screen.getByText('Label')).toHaveClass('text-foreground');
    },
  );

  it('still defaults to `default` when no variant is given', () => {
    render(<Badge>Plain</Badge>);

    expect(screen.getByText('Plain')).toHaveAttribute(
      'data-variant',
      'default',
    );
  });
});
