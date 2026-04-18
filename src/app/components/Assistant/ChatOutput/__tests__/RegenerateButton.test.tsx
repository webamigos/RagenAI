import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { RegenerateButton } from '../RegenerateButton';

const messages = {
  assistant: {
    chat: {
      regenerate: 'Regenerate response',
      'regenerate-error': 'Failed to regenerate response. Please try again.',
    },
  },
};

function renderButton(props: {
  onRegenerate?: () => Promise<void>;
  disabled?: boolean;
}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RegenerateButton
        onRegenerate={
          props.onRegenerate ?? vi.fn().mockResolvedValue(undefined)
        }
        disabled={props.disabled ?? false}
      />
    </NextIntlClientProvider>,
  );
}

describe('RegenerateButton', () => {
  it('renderuje przycisk z data-testid="regenerate-button"', () => {
    renderButton({});
    expect(screen.getByTestId('regenerate-button')).toBeInTheDocument();
  });

  it('kliknięcie wywołuje onRegenerate', async () => {
    const onRegenerate = vi.fn().mockResolvedValue(undefined);
    renderButton({ onRegenerate });

    await userEvent.click(screen.getByTestId('regenerate-button'));

    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it('podczas ładowania przycisk jest disabled', async () => {
    let resolve!: () => void;
    const onRegenerate = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );
    renderButton({ onRegenerate });

    await userEvent.click(screen.getByTestId('regenerate-button'));

    expect(screen.getByTestId('regenerate-button')).toBeDisabled();
    resolve();
  });

  it('po zakończeniu ładowania przycisk wraca do stanu idle (enabled)', async () => {
    const onRegenerate = vi.fn().mockResolvedValue(undefined);
    renderButton({ onRegenerate });

    await userEvent.click(screen.getByTestId('regenerate-button'));

    await waitFor(() => {
      expect(screen.getByTestId('regenerate-button')).not.toBeDisabled();
    });
  });

  it('prop disabled=true blokuje kliknięcie', async () => {
    const onRegenerate = vi.fn().mockResolvedValue(undefined);
    renderButton({ onRegenerate, disabled: true });

    await userEvent.click(screen.getByTestId('regenerate-button'));

    expect(onRegenerate).not.toHaveBeenCalled();
  });
});
