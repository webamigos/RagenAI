import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { PiiPolicySelect } from '../PiiPolicySelect';

vi.mock('@/i18n/routing', () => ({
  Link: ({
    children,
    href,
    ...props
  }: React.PropsWithChildren<{ href: string; [key: string]: unknown }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const messages = {
  'pii-policy': {
    'none-label': 'None',
    'none-description': 'No masking',
    'toxic-only-label': 'Toxic Only',
    'toxic-only-description': 'Masks toxic data',
    'strict-label': 'Strict',
    'strict-description': 'Masks everything',
    'select-label': 'PII Policy',
    'learn-more': 'Learn more about PII policy →',
  },
};

function renderSelect(
  props: Partial<React.ComponentProps<typeof PiiPolicySelect>> = {},
) {
  return render(
    <NextIntlClientProvider messages={messages} locale="en">
      <PiiPolicySelect value="TOXIC_ONLY" onChange={vi.fn()} {...props} />
    </NextIntlClientProvider>,
  );
}

describe('PiiPolicySelect', () => {
  it('renders all three options', () => {
    renderSelect();
    expect(screen.getByRole('option', { name: 'None' })).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Toxic Only' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Strict' })).toBeInTheDocument();
  });

  it('shows description for selected value in non-compact mode', () => {
    renderSelect({ value: 'NONE' });
    expect(screen.getByText('No masking')).toBeInTheDocument();
  });

  it('does not show description in compact mode', () => {
    renderSelect({ compact: true });
    expect(screen.queryByText('Masks toxic data')).not.toBeInTheDocument();
  });

  it('does not show info link by default', () => {
    renderSelect();
    expect(
      screen.queryByText('Learn more about PII policy →'),
    ).not.toBeInTheDocument();
  });

  it('shows info link when showInfoLink=true', () => {
    renderSelect({ showInfoLink: true });
    const link = screen.getByText('Learn more about PII policy →');
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute('href', '/settings/pii-policy');
  });

  it('does not show info link in compact mode even when showInfoLink=true', () => {
    renderSelect({ compact: true, showInfoLink: true });
    expect(
      screen.queryByText('Learn more about PII policy →'),
    ).not.toBeInTheDocument();
  });
});
