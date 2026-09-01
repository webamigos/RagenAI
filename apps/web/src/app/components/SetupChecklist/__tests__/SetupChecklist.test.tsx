import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import type { SetupReport } from '@/features/setup/contracts/types';
import { SetupChecklist } from '../SetupChecklist';
import messages from '@/app/messages/en.json';

const renderChecklist = (report: SetupReport) =>
  render(
    <NextIntlClientProvider messages={messages} locale="en">
      <SetupChecklist report={report} />
    </NextIntlClientProvider>,
  );

const report = (findings: SetupReport['findings']): SetupReport => ({
  findings,
  hasBlockingIssues: findings.some((f) => f.severity === 'required'),
});

describe('SetupChecklist', () => {
  it('renders nothing when there is nothing to configure', () => {
    const { container } = renderChecklist(report([]));

    expect(container).toBeEmptyDOMElement();
  });

  it('names the variable and the example for a finding', () => {
    renderChecklist(
      report([
        {
          id: 'database',
          severity: 'required',
          vars: ['DATABASE_URL'],
          example: 'postgresql://postgres:pass@localhost:5432/smartrag',
        },
      ]),
    );

    const item = screen.getByTestId('setup-finding-database');
    expect(within(item).getByText('DATABASE_URL')).toBeInTheDocument();
    expect(
      within(item).getByText(
        'postgresql://postgres:pass@localhost:5432/smartrag',
      ),
    ).toBeInTheDocument();
    expect(within(item).getByText(/not even signing in/i)).toBeInTheDocument();
  });

  it('puts required findings ahead of recommended ones', () => {
    renderChecklist(
      report([
        {
          id: 'temporal',
          severity: 'recommended',
          vars: ['TEMPORAL_SERVER_ADDRESS'],
          example: 'localhost:7233',
        },
        {
          id: 'database',
          severity: 'required',
          vars: ['DATABASE_URL'],
          example: 'postgresql://localhost:5432/smartrag',
        },
      ]),
    );

    const rendered = screen.getAllByTestId(/^setup-finding-/);
    expect(rendered.map((el) => el.dataset.testid)).toEqual([
      'setup-finding-database',
      'setup-finding-temporal',
    ]);
  });

  it('interpolates the values a finding carries', () => {
    renderChecklist(
      report([
        {
          id: 'embeddings-dimension-mismatch',
          severity: 'required',
          vars: ['EMBEDDINGS_MODEL', 'VECTOR_SIZE'],
          values: {
            model: 'cohere-embed-multilingual-v3',
            expected: 1024,
            configured: '3584',
          },
          example: 'VECTOR_SIZE=1024',
        },
      ]),
    );

    const item = screen.getByTestId(
      'setup-finding-embeddings-dimension-mismatch',
    );
    expect(
      within(item).getByText(
        /cohere-embed-multilingual-v3 produces 1,?024-dimensional vectors, but VECTOR_SIZE is 3,?584/,
      ),
    ).toBeInTheDocument();
  });

  it('leads with the blocking headline only when something is blocking', () => {
    const blocking = renderChecklist(
      report([
        {
          id: 'database',
          severity: 'required',
          vars: ['DATABASE_URL'],
          example: 'postgresql://localhost:5432/smartrag',
        },
      ]),
    );
    expect(
      screen.getByText(messages.setup['blocking-title']),
    ).toBeInTheDocument();
    blocking.unmount();

    renderChecklist(
      report([
        {
          id: 'temporal',
          severity: 'recommended',
          vars: ['TEMPORAL_SERVER_ADDRESS'],
          example: 'localhost:7233',
        },
      ]),
    );
    expect(screen.getByText(messages.setup.title)).toBeInTheDocument();
  });
});
