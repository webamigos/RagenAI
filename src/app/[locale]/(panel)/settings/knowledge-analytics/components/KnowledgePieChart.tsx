'use client';

import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip } from 'recharts';

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
  centerSublabel?: string;
  emptyLabel: string;
  emptyIcon?: React.ReactNode;
};

export function KnowledgePieChart({
  data,
  centerLabel,
  centerSublabel,
  emptyLabel,
  emptyIcon,
}: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    setActiveIndex(null);
    setSelectedIndex(null);
  }, [data]);

  const hasData = data.length > 0 && data.some((d) => d.value > 0);

  const SIZE = 220;
  const INNER = 70;
  const OUTER = 90;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        {hasData ? (
          <>
            <PieChart width={SIZE} height={SIZE}>
              <Pie
                data={data}
                dataKey="value"
                cx={SIZE / 2}
                cy={SIZE / 2}
                innerRadius={INNER}
                outerRadius={OUTER}
                paddingAngle={2}
                strokeWidth={0}
                stroke="transparent"
              >
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.color}
                    stroke={activeIndex === index ? entry.color : 'transparent'}
                    strokeWidth={activeIndex === index ? 4 : 0}
                    style={{
                      cursor: 'pointer',
                      opacity:
                        selectedIndex !== null && selectedIndex !== index
                          ? 0.4
                          : 1,
                      transition: 'all 0.2s ease',
                      filter:
                        activeIndex === index
                          ? 'brightness(1.15) drop-shadow(0 0 6px currentColor)'
                          : 'none',
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

            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-3xl font-bold tabular-nums text-foreground leading-none">
                {centerLabel}
              </span>
              {centerSublabel && (
                <span className="text-xs text-muted-foreground mt-1 font-medium">
                  {centerSublabel}
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <div
              className="relative flex items-center justify-center"
              style={{ width: 180, height: 180 }}
            >
              <svg
                viewBox="0 0 180 180"
                className="absolute inset-0 w-full h-full"
              >
                <circle
                  cx="90"
                  cy="90"
                  r="70"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="16"
                  strokeDasharray="6 6"
                  className="text-muted/30"
                />
              </svg>
              <div className="relative flex flex-col items-center gap-1">
                {emptyIcon && (
                  <span className="text-muted-foreground/50">{emptyIcon}</span>
                )}
                <span className="text-xs text-muted-foreground/70 text-center font-medium max-w-[110px] leading-tight">
                  {emptyLabel}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
