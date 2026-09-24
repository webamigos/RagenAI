import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

import PanelError from '../error';
import messages from '@/app/messages/pl.json';

vi.mock('@/i18n/routing', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

describe('panel error boundary', () => {
  it('explains in the reader’s language and offers a retry and a way out', async () => {
    const retry = vi.fn();
    render(
      <NextIntlClientProvider locale="pl" messages={messages}>
        <PanelError error={new Error('P2023')} retry={retry} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      messages['panel-error'].title,
    );
    expect(
      screen.getByRole('link', { name: messages['panel-error']['new-chat'] }),
    ).toHaveAttribute('href', '/new');

    await userEvent.click(
      screen.getByRole('button', { name: messages['panel-error'].retry }),
    );
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
