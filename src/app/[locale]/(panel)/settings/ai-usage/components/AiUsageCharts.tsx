'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';
import type { PieLabelRenderProps } from 'recharts';
import type { AiUsageChartData } from '@/features/ai-usage/contracts/ai-usage.types';

type Props = {
  charts: AiUsageChartData;
};

const COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
];

const STEP_COLORS: Record<string, string> = {
  CHAT_COMPLETION: '#3b82f6',
  MODERATION: '#10b981',
  REPHRASING: '#f59e0b',
  EMBEDDINGS: '#8b5cf6',
};

function formatCost(value: number): string {
  return `$${value.toFixed(4)}`;
}

function formatTokensShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function AiUsageCharts({ charts }: Props) {
  const hasData =
    charts.daily.length > 0 ||
    charts.byStep.length > 0 ||
    charts.byModel.length > 0;

  if (!hasData) return null;

  return (
    <div className="space-y-8">
      {/* Daily usage over time */}
      {charts.daily.length > 1 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Usage Over Time</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Daily tokens */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Tokens per Day
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={charts.daily}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(d: string) => {
                      const parts = d.split('-');
                      return `${parts[1]}/${parts[2]}`;
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={formatTokensShort}
                  />
                  <RechartsTooltip
                    formatter={(value) => [
                      formatTokensShort(Number(value)),
                      'Tokens',
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="tokens"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Daily cost */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Cost per Day
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={charts.daily}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(d: string) => {
                      const parts = d.split('-');
                      return `${parts[1]}/${parts[2]}`;
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => `$${v.toFixed(2)}`}
                  />
                  <RechartsTooltip
                    formatter={(value) => [formatCost(Number(value)), 'Cost']}
                  />
                  <Bar dataKey="cost" fill="#10b981" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

      {/* Breakdown charts */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Breakdown</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* By Step */}
          {charts.byStep.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                By Step
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={charts.byStep}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="cost"
                    nameKey="step"
                    label={(props: PieLabelRenderProps) => {
                      const step = String(
                        (props as unknown as Record<string, unknown>).step ??
                          '',
                      );
                      const pct = ((props.percent as number) ?? 0) * 100;
                      return `${step.replace('_', ' ')} ${pct.toFixed(0)}%`;
                    }}
                    labelLine={false}
                  >
                    {charts.byStep.map((entry) => (
                      <Cell
                        key={entry.step}
                        fill={STEP_COLORS[entry.step] ?? '#6b7280'}
                      />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(value) => formatCost(Number(value))}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* By Model */}
          {charts.byModel.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                By Model
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={charts.byModel.slice(0, 8)} layout="vertical">
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => `$${v.toFixed(2)}`}
                  />
                  <YAxis
                    type="category"
                    dataKey="model"
                    tick={{ fontSize: 10 }}
                    width={140}
                    tickFormatter={(m: string) =>
                      m.length > 22 ? m.slice(0, 22) + '...' : m
                    }
                  />
                  <RechartsTooltip
                    formatter={(value) => [formatCost(Number(value)), 'Cost']}
                  />
                  <Bar dataKey="cost" radius={[0, 2, 2, 0]}>
                    {charts.byModel.slice(0, 8).map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* By Organization */}
          {charts.byOrg.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                By Organization
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={charts.byOrg.slice(0, 8)} layout="vertical">
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => `$${v.toFixed(2)}`}
                  />
                  <YAxis
                    type="category"
                    dataKey="organizationName"
                    tick={{ fontSize: 10 }}
                    width={120}
                    tickFormatter={(n: string) =>
                      n.length > 18 ? n.slice(0, 18) + '...' : n
                    }
                  />
                  <RechartsTooltip
                    formatter={(value) => [formatCost(Number(value)), 'Cost']}
                  />
                  <Bar dataKey="cost" radius={[0, 2, 2, 0]}>
                    {charts.byOrg.slice(0, 8).map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
