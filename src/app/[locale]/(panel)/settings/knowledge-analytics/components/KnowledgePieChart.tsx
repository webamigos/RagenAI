'use client';

import { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

export type PieSlice = {
  name: string;
  value: number;
  color: string;
};

type TooltipPayloadEntry = {
  payload: PieSlice;
};

type CustomTooltipProps = {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
};

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }
  const entry = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg px-3 py-2">
      <p className="text-xs font-semibold text-foreground">{entry.name}</p>
      <p className="text-sm font-bold text-foreground">{entry.value}</p>
    </div>
  );
}

type Props = {
  data: PieSlice[];
  centerLabel: string;
  emptyLabel: string;
};

export function KnowledgePieChart({ data, centerLabel, emptyLabel }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const hasData = data.length > 0 && data.some((d) => d.value > 0);

  return (
    <div
      className="relative mx-auto w-full max-w-[280px]"
      style={{ height: 280 }}
    >
      {hasData ? (
        <>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                cx="50%"
                cy="50%"
                innerRadius={80}
                outerRadius={100}
                paddingAngle={1}
                strokeWidth={2}
                stroke="transparent"
              >
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.color}
                    stroke={activeIndex === index ? entry.color : 'transparent'}
                    strokeWidth={activeIndex === index ? 4 : 2}
                    style={{
                      cursor: 'pointer',
                      opacity:
                        selectedIndex !== null && selectedIndex !== index
                          ? 0.5
                          : 1,
                      transition: 'all 0.2s ease',
                      filter:
                        activeIndex === index ? 'brightness(1.1)' : 'none',
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseLeave={() => setActiveIndex(null)}
                    onClick={() =>
                      setSelectedIndex(selectedIndex === index ? null : index)
                    }
                  />
                ))}
              </Pie>
              <Tooltip
                content={<CustomTooltip />}
                wrapperStyle={{ zIndex: 9999 }}
              />
            </PieChart>
          </ResponsiveContainer>

          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-3xl font-bold text-foreground">
              {centerLabel}
            </span>
          </div>
        </>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center relative">
          <svg viewBox="0 0 280 280" className="absolute inset-0 w-full h-full">
            <circle
              cx="140"
              cy="140"
              r="90"
              fill="none"
              stroke="currentColor"
              strokeWidth="20"
              className="text-muted/40"
            />
          </svg>
          <span className="relative text-sm text-muted-foreground text-center px-4">
            {emptyLabel}
          </span>
        </div>
      )}
    </div>
  );
}
