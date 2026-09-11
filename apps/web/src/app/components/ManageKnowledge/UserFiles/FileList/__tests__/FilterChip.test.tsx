import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

import { FilterChip } from '../FilterChip';
import messages from '@/app/messages/en.json';

type Colour = 'red' | 'green' | 'blue';

const OPTIONS = [
  { value: 'red' as Colour, label: 'Red' },
  { value: 'green' as Colour, label: 'Green' },
  { value: 'blue' as Colour, label: 'Blue' },
];

function show(selected: Colour[] = [], onChange = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <FilterChip
        name="Colour"
        allLabel="All colours"
        options={OPTIONS}
        selected={selected}
        onChange={onChange}
        data-testid="chip"
      />
    </NextIntlClientProvider>,
  );
  return { onChange };
}

const trigger = () => screen.getByRole('button', { name: /^Colour:/ });
const clear = () => screen.queryByRole('button', { name: /^Clear/ });

describe('FilterChip', () => {
  it('says what it is set to, on its face', () => {
    show(['green']);

    // The whole point of the chip: a control labelled only "Colour" makes you
    // open it to find out whether it is doing anything.
    expect(trigger()).toHaveTextContent('Colour: Green');
  });

  it('says "all" when it is filtering nothing', () => {
    show();

    expect(trigger()).toHaveTextContent('Colour: All colours');
  });

  it('abbreviates a long selection but keeps the whole of it readable', () => {
    show(['red', 'green', 'blue']);

    // A chip that grows to "Red, Green, Blue" pushes the rest of the bar off
    // the row. The count is visible; the list is the accessible name.
    expect(trigger()).toHaveTextContent('Colour: Red +2');
    expect(trigger()).toHaveAccessibleName('Colour: Red, Green, Blue');
  });

  it('offers a clear only once something is set', () => {
    show();
    expect(clear()).toBeNull();
  });

  it('clears just this filter, in one click, without opening the menu', async () => {
    const user = userEvent.setup();
    const { onChange } = show(['red', 'green']);

    await user.click(clear() as HTMLElement);

    expect(onChange).toHaveBeenCalledWith([]);
    // The menu must not have opened: the clear button is a sibling of the
    // trigger, not nested inside it.
    expect(screen.queryByLabelText('Red')).not.toBeInTheDocument();
  });

  it('marks itself active so a set filter is visible at a glance', () => {
    show(['red']);

    expect(screen.getByTestId('chip')).toHaveAttribute('data-active', 'true');
  });

  it('is not active when nothing is set', () => {
    show();

    expect(screen.getByTestId('chip')).toHaveAttribute('data-active', 'false');
  });

  it('adds a value without dropping the ones already chosen', async () => {
    const user = userEvent.setup();
    const { onChange } = show(['red']);

    await user.click(trigger());
    await user.click(screen.getByLabelText('Blue'));

    expect(onChange).toHaveBeenCalledWith(['red', 'blue']);
  });

  it('removes a value that was already chosen', async () => {
    const user = userEvent.setup();
    const { onChange } = show(['red', 'blue']);

    await user.click(trigger());
    await user.click(screen.getByLabelText('Blue'));

    expect(onChange).toHaveBeenCalledWith(['red']);
  });

  it('closes on Escape, not only on a click elsewhere', async () => {
    const user = userEvent.setup();
    show();

    await user.click(trigger());
    expect(screen.getByLabelText('Red')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    // A panel that can only be dismissed by clicking away is a panel a
    // keyboard cannot get out of.
    expect(screen.queryByLabelText('Red')).not.toBeInTheDocument();
  });

  it('puts focus back on the trigger after Escape', async () => {
    const user = userEvent.setup();
    show();

    await user.click(trigger());
    screen.getByLabelText('Red').focus();

    await user.keyboard('{Escape}');

    // Closing unmounts the checkbox that had focus, which drops it to
    // `<body>` — the next Tab would restart at the top of the document
    // instead of continuing from the filter bar.
    expect(trigger()).toHaveFocus();
  });

  it('does not describe itself as a menu, because it is not one', () => {
    show();

    // `aria-haspopup` promises menu roles and arrow-key navigation. This
    // opens a group of checkboxes.
    expect(trigger()).not.toHaveAttribute('aria-haspopup');
  });

  it('closes when the click lands outside it', async () => {
    const user = userEvent.setup();
    show();

    await user.click(trigger());
    await user.click(document.body);

    expect(screen.queryByLabelText('Red')).not.toBeInTheDocument();
  });

  it('tells assistive technology whether the menu is open', async () => {
    const user = userEvent.setup();
    show();

    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger());
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
  });
});
