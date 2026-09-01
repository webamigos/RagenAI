import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { PiiPolicyBadge } from '../PiiPolicyBadge';

const messages = {
  'pii-policy': {
    'badge-none': 'No masking',
    'badge-toxic-only': 'Toxic only',
    'badge-strict': 'Strict',
    label: 'PII Masking Policy',
  },
};

function renderBadge(
  piiPolicy: 'NONE' | 'TOXIC_ONLY' | 'STRICT' | null | undefined,
) {
  return render(
    <NextIntlClientProvider messages={messages} locale="en">
      <PiiPolicyBadge piiPolicy={piiPolicy} />
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
});
