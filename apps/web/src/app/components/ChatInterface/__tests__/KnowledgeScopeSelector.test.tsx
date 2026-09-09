import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

import { KnowledgeScopeSelector } from '../KnowledgeScopeSelector';
import messages from '@/app/messages/en.json';

type Props = Parameters<typeof KnowledgeScopeSelector>[0];

const open = async (overrides: Partial<Omit<Props, 'onChange'>> = {}) => {
  const onChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <KnowledgeScopeSelector
        value="KNOWLEDGE_BASE"
        hasAssistants
        assistantName="Sprzedaz"
        {...overrides}
        onChange={onChange}
      />
    </NextIntlClientProvider>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Knowledge' }));
  return onChange;
};

describe('KnowledgeScopeSelector', () => {
  it('offers all three levels', async () => {
    await open();

    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('selects a level and closes', async () => {
    const onChange = await open();

    await userEvent.click(
      screen.getByRole('option', { name: /Just the model/ }),
    );

    expect(onChange).toHaveBeenCalledWith('MODEL_ONLY');
  });

  it('says the scope is fixed for the thread', async () => {
    // The consequence of a thread-level scope — changing your mind means a new
    // thread — is worth stating rather than leaving to be discovered.
    await open();

    expect(screen.getByText('Applies to the whole thread')).toBeInTheDocument();
  });

  describe('when Assistant cannot be sent', () => {
    // The server rejects ASSISTANT with no resolvable project rather than
    // widening the search. That is only defensible if the UI cannot produce
    // the combination — so these are the two ways it is held back, and each
    // explains itself rather than being hidden.
    it('is disabled, with a reason, when there are no assistants at all', async () => {
      await open({ hasAssistants: false, assistantName: null });

      const option = screen.getByRole('option', { name: /Assistant/ });
      expect(option).toHaveAttribute('aria-disabled', 'true');
      expect(option).toHaveTextContent('You have no assistants yet');
    });

    it('asks for a mention when there are assistants but none is named', async () => {
      await open({ hasAssistants: true, assistantName: null });

      const option = screen.getByRole('option', { name: /Assistant/ });
      expect(option).toHaveAttribute('aria-disabled', 'true');
      expect(option).toHaveTextContent('Mention an assistant with @ first');
    });

    it('cannot be selected', async () => {
      const onChange = await open({
        hasAssistants: false,
        assistantName: null,
      });

      await userEvent.click(screen.getByRole('option', { name: /Assistant/ }));

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  it('ignores a selection made after it became disabled', async () => {
    // The trigger cannot be opened while disabled, but it can become disabled
    // *while open*: `disabled` is `isLoading || isPending`, and Enter in the
    // composer submits without closing the popover.
    const onChange = vi.fn();
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <KnowledgeScopeSelector
          value="KNOWLEDGE_BASE"
          onChange={onChange}
          hasAssistants
          assistantName="Sprzedaz"
        />
      </NextIntlClientProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Knowledge' }));

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <KnowledgeScopeSelector
          value="KNOWLEDGE_BASE"
          onChange={onChange}
          hasAssistants
          assistantName="Sprzedaz"
          disabled
        />
      </NextIntlClientProvider>,
    );
    await userEvent.click(
      screen.getByRole('option', { name: /Just the model/ }),
    );

    expect(onChange).not.toHaveBeenCalled();
  });

  it('names the assistant rather than the level once one is chosen', async () => {
    // At that level the name is the useful half.
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <KnowledgeScopeSelector
          value="ASSISTANT"
          onChange={vi.fn()}
          hasAssistants
          assistantName="Sprzedaz"
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole('button', { name: 'Knowledge' })).toHaveTextContent(
      'Sprzedaz',
    );
  });
});
