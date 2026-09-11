import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { PiiPolicyBadge } from '../PiiPolicyBadge';

const messages = {
  'pii-policy': {
    'badge-none': 'No masking',
    'badge-toxic-only': 'Toxic only',
    'badge-strict': 'Strict',
    'tag-none': 'None',
    'tag-toxic-only': 'Sensitive',
    'tag-strict': 'All PII',
    label: 'PII Masking Policy',
  },
};

function renderBadge(
  piiPolicy: 'NONE' | 'TOXIC_ONLY' | 'STRICT' | null | undefined,
  compact = false,
) {
  return render(
    <NextIntlClientProvider messages={messages} locale="en">
      <PiiPolicyBadge piiPolicy={piiPolicy} compact={compact} />
    </NextIntlClientProvider>,
  );
}

describe('PiiPolicyBadge', () => {
  it('renders NONE badge with correct text and testid', () => {
    renderBadge('NONE');
    expect(screen.getByTestId('pii-policy-badge-none')).toBeInTheDocument();
    expect(screen.getByText('No masking')).toBeInTheDocument();
  });

  it('renders TOXIC_ONLY badge with correct text and testid', () => {
    renderBadge('TOXIC_ONLY');
    expect(
      screen.getByTestId('pii-policy-badge-toxic-only'),
    ).toBeInTheDocument();
    expect(screen.getByText('Toxic only')).toBeInTheDocument();
  });

  it('renders STRICT badge with correct text and testid', () => {
    renderBadge('STRICT');
    expect(screen.getByTestId('pii-policy-badge-strict')).toBeInTheDocument();
    expect(screen.getByText('Strict')).toBeInTheDocument();
  });

  it('renders nothing when piiPolicy is null', () => {
    const { container } = renderBadge(null);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when piiPolicy is undefined', () => {
    const { container } = renderBadge(undefined);
    expect(container).toBeEmptyDOMElement();
  });

  /**
   * Two surface forms of one policy. The short one is what fits the folder
   * rail; the long one has to survive in the accessible name, or the compact
   * tag would be exactly the colour-only signal it replaced.
   */
  describe('compact', () => {
    it('shows the short label', () => {
      renderBadge('STRICT', true);
      const short = screen.getByText('All PII');
      expect(short).toBeInTheDocument();
      expect(short).toHaveAttribute('aria-hidden', 'true');
    });

    it('reads out the full policy name', () => {
      renderBadge('STRICT', true);
      expect(screen.getByText('Strict')).toHaveClass('sr-only');
    });
  });
});
