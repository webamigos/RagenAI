'use client';

import { useTranslations } from 'next-intl';
import { BarChart2 } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { DailyQuestion } from '@/features/documents/contracts/knowledge-analytics.types';

type Props = {
  items: DailyQuestion[];
  isLoading: boolean;
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function DailyQuestionsChart({ items, isLoading }: Props) {
  const t = useTranslations(
    'settings-page.knowledge-analytics.daily-questions',
  );

  const totalInPeriod = items.reduce((sum, d) => sum + d.count, 0);

  const chartData = items.map((d) => ({
    date: formatDate(d.date),
    count: d.count,
  }));

  const isEmpty = totalInPeriod === 0 && !isLoading;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/40">
            <BarChart2 className="w-4 h-4 text-indigo-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold">{t('title')}</h2>
            {totalInPeriod > 0 && (
              <p className="text-xs text-muted-foreground">
                {t('total', { count: totalInPeriod })}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className={`px-5 py-4 ${isLoading ? 'opacity-60' : ''}`}>
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted">
              <BarChart2 className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground max-w-xs">
              {t('empty')}
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart
              data={chartData}
              margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval={Math.floor(chartData.length / 6)}
                className="fill-muted-foreground"
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                className="fill-muted-foreground"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                labelStyle={{ fontWeight: 600 }}
                formatter={(value: number | undefined) => [
                  value ?? 0,
                  t('tooltip-label'),
                ]}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#colorCount)"
                dot={false}
                activeDot={{ r: 4, fill: '#6366f1' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
