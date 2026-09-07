import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { CheckboxGlyph } from '../CheckboxGlyph';

describe('CheckboxGlyph', () => {
  // The whole reason this exists: it goes inside a <button> that owns the
  // click and the accessible name, so it must add neither a focus stop nor a
  // second thing for a screen reader to announce.
  it('is invisible to assistive technology and not focusable', () => {
    const { container } = render(
      <button type="button" aria-label="Select report.pdf">
        <CheckboxGlyph checked />
      </button>,
    );

    const glyph = container.querySelector('[data-state]');
    expect(glyph).toHaveAttribute('aria-hidden', 'true');
    expect(glyph?.tagName).toBe('SPAN');
    expect(glyph).not.toHaveAttribute('tabindex');
    expect(screen.getByRole('button')).toHaveAccessibleName(
      'Select report.pdf',
    );
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it.each([
    [false, 'unchecked'],
    [true, 'checked'],
    ['indeterminate' as const, 'indeterminate'],
  ])('reports %s as data-state=%s', (checked, state) => {
    const { container } = render(<CheckboxGlyph checked={checked} />);

    expect(container.querySelector('[data-state]')).toHaveAttribute(
      'data-state',
      state,
    );
  });

  it('defaults to unchecked', () => {
    const { container } = render(<CheckboxGlyph />);

    expect(container.querySelector('[data-state]')).toHaveAttribute(
      'data-state',
      'unchecked',
    );
  });
});
