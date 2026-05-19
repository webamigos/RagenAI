import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
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
    title: 'Leads',
    'enrich-button': 'Enrich',
    'enrich-success': 'Enriched',
    'enrich-failed': 'Failed',
    'enrich-no-lookup': 'No lookup',
    'status-idle': '—',
    'status-pending': 'Enriching…',
    'status-enriched': 'Enriched',
    'status-failed': 'Failed',
    'row-count': '{count, plural, one {# row} other {# rows}}',
    'manual-enrich-title': 'Manual enrichment',
    'manual-enrich-company-label': 'Company',
    'manual-enrich-error-label': 'Previous error',
    'manual-enrich-nip-label': 'NIP',
    'manual-enrich-nip-placeholder': 'e.g. 5252344078',
    'manual-enrich-nip-invalid': 'NIP must be exactly 10 digits',
    'manual-enrich-submit': 'Enrich',
    cancel: 'Cancel',
  },
};

const { LeadsGrid } = await import('../LeadsGrid');

const columns = [
  { key: 'name', label: 'Name', type: 'string', source: 'csv' },
  { key: 'company', label: 'Company', type: 'string', source: 'csv' },
  {
    key: '_enrichment_nip',
    label: 'NIP',
    type: 'string',
    source: 'enrichment',
  },
] as const;

const leads = [
  {
    id: 1,
    publicId: '11111111-1111-4111-8111-111111111111',
    rowIndex: 0,
    data: { name: 'Alice', company: 'Acme', _enrichment_nip: null },
    enrichmentStatus: LeadEnrichmentStatus.idle,
    enrichedAt: null,
    enrichmentError: null,
  },
  {
    id: 2,
    publicId: '22222222-2222-4222-8222-222222222222',
    rowIndex: 1,
    data: { name: 'Bob', company: 'Beta', _enrichment_nip: null },
    enrichmentStatus: LeadEnrichmentStatus.idle,
    enrichedAt: null,
    enrichmentError: null,
  },
];

function renderGrid() {
  return render(
    <NextIntlClientProvider messages={messages} locale="en">
      <LeadsGrid
        columns={
          columns as unknown as Parameters<typeof LeadsGrid>[0]['columns']
        }
        leads={leads as unknown as Parameters<typeof LeadsGrid>[0]['leads']}
      />
    </NextIntlClientProvider>,
  );
}

describe('LeadsGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders headers in CSV-then-enrichment order with row numbers', () => {
    renderGrid();
    const headers = screen
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers).toEqual(['#', 'Name', 'Company', 'NIP', 'Enrich']);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('marks the scroll container as a region for assistive tech', () => {
    renderGrid();
    expect(screen.getByRole('region', { name: 'Leads' })).toBeInTheDocument();
  });

  it('calls enrichLead with the row publicId when the enrich icon is clicked', async () => {
    mockEnrichLead.mockResolvedValue({ status: 'enriched' });
    renderGrid();

    const enrichButtons = screen.getAllByRole('button', { name: /^Enrich/ });
    expect(enrichButtons.length).toBeGreaterThanOrEqual(2);
    await userEvent.click(enrichButtons[0]);

    expect(mockEnrichLead).toHaveBeenCalledWith({
      leadPublicId: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('disables the same-row enrich button while in flight but leaves siblings clickable', async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    mockEnrichLead.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    renderGrid();

    const enrichButtons = screen.getAllByRole('button', { name: /^Enrich/ });
    await userEvent.click(enrichButtons[0]);

    // Row A's button should now be disabled
    expect(enrichButtons[0]).toBeDisabled();
    // Row B should still be clickable (the in-flight set is per-lead)
    expect(enrichButtons[1]).not.toBeDisabled();

    await act(async () => {
      resolveFirst({ status: 'enriched' });
    });
    await waitFor(() => expect(enrichButtons[0]).not.toBeDisabled());
  });
});
