import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { LeadEnrichmentStatus } from '@/generated/prisma/client';

vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/leads/abc',
  Link: ({ children, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a {...props}>{children}</a>
  ),
}));

const mockEnrichLead = vi.fn();
vi.mock('@/app/actions/leads', () => ({
  enrichLead: (...args: unknown[]) => mockEnrichLead(...args),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const messages = {
  'leads-page': {
    'manual-enrich-title': 'Manual enrichment',
    'manual-enrich-company-label': 'Company',
    'manual-enrich-error-label': 'Previous error',
    'manual-enrich-nip-label': 'NIP',
    'manual-enrich-nip-placeholder': 'e.g. 5252344078',
    'manual-enrich-nip-invalid': 'NIP must be exactly 10 digits',
    'manual-enrich-submit': 'Enrich',
    'manual-enrich-error-budget-exceeded':
      'Daily enrichment budget exceeded. Try again tomorrow.',
    'manual-enrich-error-unavailable':
      'Enrichment service unavailable. Try again later.',
    'manual-enrich-error-unknown': 'Enrichment failed. Please try again.',
    cancel: 'Cancel',
    'enrich-success': 'Enriched',
    'enrich-failed': 'Enrichment failed',
  },
};

const { ManualNipModal } = await import('../ManualNipModal');

const baseLead = {
  id: 1,
  publicId: '11111111-1111-4111-8111-111111111111',
  rowIndex: 0,
  data: { company: 'AgroAI Sp. z o.o.' },
  enrichmentStatus: LeadEnrichmentStatus.failed,
  enrichedAt: null,
  enrichmentError: 'No matching company found',
};

function renderModal(
  lead: typeof baseLead | null = baseLead,
  onClose = vi.fn(),
) {
  return {
    onClose,
    ...render(
      <NextIntlClientProvider messages={messages} locale="en">
        <ManualNipModal lead={lead} onClose={onClose} />
      </NextIntlClientProvider>,
    ),
  };
}

describe('ManualNipModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders company name and sanitized previous error from lead', () => {
    renderModal();
    expect(screen.getByText('AgroAI Sp. z o.o.')).toBeInTheDocument();
    expect(
      screen.getByText('Enrichment failed. Please try again.'),
    ).toBeInTheDocument();
  });

  it('sanitizes budget exceeded error to translated message', () => {
    renderModal({
      ...baseLead,
      enrichmentError:
        'Daily Rejestr.io budget exceeded for org abc-123: 0.00/0.00 PLN',
    });
    expect(
      screen.getByText('Daily enrichment budget exceeded. Try again tomorrow.'),
    ).toBeInTheDocument();
  });

  it('sanitizes upstream error to translated unavailable message', () => {
    renderModal({ ...baseLead, enrichmentError: 'upstream_503' });
    expect(
      screen.getByText('Enrichment service unavailable. Try again later.'),
    ).toBeInTheDocument();
  });

  it('is closed when lead is null', () => {
    renderModal(null);
    expect(screen.queryByText('Manual enrichment')).not.toBeInTheDocument();
  });

  it('keeps Enrich button disabled when NIP input is empty', () => {
    renderModal();
    const submitBtn = screen.getByRole('button', { name: 'Enrich' });
    expect(submitBtn).toBeDisabled();
  });

  it('shows validation error for invalid NIP and keeps button disabled', async () => {
    renderModal();
    const input = screen.getByLabelText('NIP');
    await userEvent.type(input, '123');
    expect(
      screen.getByText('NIP must be exactly 10 digits'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enrich' })).toBeDisabled();
  });

  it('enables Enrich button when 10-digit NIP is entered', async () => {
    renderModal();
    const input = screen.getByLabelText('NIP');
    await userEvent.type(input, '5252344078');
    expect(
      screen.queryByText('NIP must be exactly 10 digits'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enrich' })).not.toBeDisabled();
  });

  it('strips spaces and dashes from NIP before validation', async () => {
    renderModal();
    const input = screen.getByLabelText('NIP');
    await userEvent.type(input, '525-234-40-78');
    expect(
      screen.queryByText('NIP must be exactly 10 digits'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enrich' })).not.toBeDisabled();
  });

  it('calls enrichLead with normalized NIP on submit', async () => {
    mockEnrichLead.mockResolvedValue({ status: 'enriched' });
    const { onClose } = renderModal();
    const input = screen.getByLabelText('NIP');
    await userEvent.type(input, '525-234-40-78');
    await userEvent.click(screen.getByRole('button', { name: 'Enrich' }));

    expect(mockEnrichLead).toHaveBeenCalledWith({
      leadPublicId: '11111111-1111-4111-8111-111111111111',
      lookup: { nip: '5252344078' },
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows server error and keeps modal open on failed enrichment', async () => {
    mockEnrichLead.mockResolvedValue({
      status: 'failed',
      error: 'NIP not found in registry',
    });
    const { onClose } = renderModal();
    await userEvent.type(screen.getByLabelText('NIP'), '5252344078');
    await userEvent.click(screen.getByRole('button', { name: 'Enrich' }));

    await waitFor(() =>
      expect(screen.getByText('NIP not found in registry')).toBeInTheDocument(),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows server error on thrown action error', async () => {
    mockEnrichLead.mockRejectedValue(new Error('Network timeout'));
    renderModal();
    await userEvent.type(screen.getByLabelText('NIP'), '5252344078');
    await userEvent.click(screen.getByRole('button', { name: 'Enrich' }));

    await waitFor(() =>
      expect(screen.getByText('Network timeout')).toBeInTheDocument(),
    );
  });

  it('calls onClose when Cancel is clicked', async () => {
    const { onClose } = renderModal();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });
});
