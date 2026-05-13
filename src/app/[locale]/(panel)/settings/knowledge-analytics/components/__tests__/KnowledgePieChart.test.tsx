import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

vi.mock('recharts', () => ({
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie">{children}</div>
  ),
  Cell: () => <div data-testid="cell" />,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import { KnowledgePieChart } from '../KnowledgePieChart';

const messages = {};

function wrap(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe('KnowledgePieChart', () => {
  it('renders pie chart when data is provided', () => {
    wrap(
      <KnowledgePieChart
        data={[
          { name: 'Doc A', value: 10, color: 'rgb(59, 130, 246)' },
          { name: 'Doc B', value: 5, color: 'rgb(234, 179, 8)' },
        ]}
        centerLabel="15"
        emptyLabel="No data"
      />,
    );
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
  });

  it('renders center label when data is provided', () => {
    wrap(
      <KnowledgePieChart
        data={[{ name: 'Doc A', value: 10, color: 'rgb(59, 130, 246)' }]}
        centerLabel="42"
        emptyLabel="No data"
      />,
    );
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders empty state when data is empty', () => {
    wrap(
      <KnowledgePieChart
        data={[]}
        centerLabel="0"
        emptyLabel="No citations yet"
      />,
    );
    expect(screen.getByText('No citations yet')).toBeInTheDocument();
    expect(screen.queryByTestId('pie-chart')).not.toBeInTheDocument();
  });

  it('renders one Cell per data entry', () => {
    wrap(
      <KnowledgePieChart
        data={[
          { name: 'A', value: 1, color: 'red' },
          { name: 'B', value: 2, color: 'blue' },
          { name: 'C', value: 3, color: 'green' },
        ]}
        centerLabel="6"
        emptyLabel="No data"
      />,
    );
    expect(screen.getAllByTestId('cell')).toHaveLength(3);
  });
});
