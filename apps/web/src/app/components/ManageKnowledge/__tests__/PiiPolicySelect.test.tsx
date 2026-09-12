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
    'badge-none': 'No masking',
    'badge-toxic-only': 'Sensitive data',
    'badge-strict': 'All personal data',
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
    expect(link.closest('a')).toHaveAttribute(
      'href',
      '/organization/pii-policy',
    );
  });

  it('does not show info link in compact mode even when showInfoLink=true', () => {
    renderSelect({ compact: true, showInfoLink: true });
    expect(
      screen.queryByText('Learn more about PII policy →'),
    ).not.toBeInTheDocument();
  });

  /**
   * The knowledge base's policy column is 168px, where "None — keep all data"
   * renders as "None — keep ...". The short forms are the `badge-*` strings
   * the folder tag and the Policy filter chip already use — panel rule 22 asks
   * the PII copy to name a policy the same way everywhere.
   */
  it('uses the badge names in compact mode, which is what fits a table cell', () => {
    renderSelect({ compact: true });

    expect(
      screen.getByRole('option', { name: 'Sensitive data' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'All personal data' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Toxic Only' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the full names where there is room for them', () => {
    renderSelect({ compact: false });

    expect(
      screen.getByRole('option', { name: 'Toxic Only' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Sensitive data' }),
    ).not.toBeInTheDocument();
  });

  /**
   * It fills its cell and truncates, rather than carrying a width of its own.
   * The cap it used to have was 140px inside a 144px box — four pixels short
   * of "All personal data", which is the one option that has to fit, because
   * it is the strictest. The column bounds the control; the control does not
   * need to bound itself.
   */
  it('fills its cell and truncates in compact mode, at the 24px size phase 7 asks for', () => {
    renderSelect({ compact: true, value: 'STRICT' });
    const select = screen.getByRole('combobox');
    expect(select.className).toContain('w-full');
    expect(select.className).toContain('truncate');
    expect(select.className).toContain('h-6');
    expect(select.className).toContain('text-xs');
  });

  it('is the full-size control in non-compact mode', () => {
    renderSelect({ compact: false });
    const select = screen.getByRole('combobox');
    expect(select.className).toContain('w-full');
    expect(select.className).toContain('text-sm');
    expect(select.className).not.toContain('h-6');
  });
});
