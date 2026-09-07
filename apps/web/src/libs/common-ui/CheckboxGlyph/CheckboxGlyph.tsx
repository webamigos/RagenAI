import clsx from 'clsx';
import { CheckIcon, MinusIcon } from 'lucide-react';
import React from 'react';

/**
 * A checkbox that is only a picture of one.
 *
 * Seven call sites render a checkbox inside a `<button>` that does the
 * toggling — a file row, a "select all" bar, a filter pill. The box there is
 * feedback, not a control: it has no handler of its own, and the button around
 * it already carries the click target and the accessible name.
 *
 * That matters more after the move to Radix than it did before. Radix's
 * `Checkbox` renders a `<button role="checkbox">`, so using it in those places
 * would nest a button inside a button — invalid markup, and React will
 * complain about it during hydration. The component it replaced rendered a
 * `<span role="checkbox" tabindex="0">`, which slipped past the DOM rule but
 * still put a second, unlabelled focus stop inside every one of those rows.
 *
 * So this renders an `aria-hidden` span and nothing else. One control, one
 * focus stop, one accessible name — the button's.
 *
 * Use `@/components/ui/checkbox` wherever the box is the control. The visual
 * is deliberately kept in step with it.
 */
export function CheckboxGlyph({
  checked = false,
  className,
}: {
  /** `'indeterminate'` draws the dash used for a partial selection. */
  checked?: boolean | 'indeterminate';
  className?: string;
}) {
  const filled = checked !== false;
  // Mirrors Radix's own three-state attribute, so the two stay styleable the
  // same way.
  const state = checked === 'indeterminate' ? 'indeterminate' : undefined;

  return (
    <span
      aria-hidden="true"
      data-state={state ?? (checked ? 'checked' : 'unchecked')}
      className={clsx(
        className,
        'inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border shadow-xs',
        filled
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input dark:bg-input/30',
      )}
    >
      {checked === 'indeterminate' && <MinusIcon className="size-3.5" />}
      {checked === true && <CheckIcon className="size-3.5" />}
    </span>
  );
}
