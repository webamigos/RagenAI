'use client';

import { useState, useEffect } from 'react';
import { getApiUsageStats } from '../actions';

function getProgressColor(isWarning: boolean): string {
  if (isWarning) {
    return 'bg-yellow-500';
  }
  return 'bg-primary';
}

export function ApiUsageCard() {
  const [data, setData] = useState<{
    current: number;
    limit: number | null;
    exceeded: boolean;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getApiUsageStats()
      .then((result) => {
        setData(result);
      })
      .catch(() => {
        // Silently fail — the card just won't show data
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card p-4 animate-pulse">
        <div className="h-4 bg-muted rounded w-32 mb-2" />
        <div className="h-8 bg-muted rounded w-20" />
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const hasLimit = data.limit !== null;
  const percentage = hasLimit
    ? Math.min((data.current / data.limit!) * 100, 100)
    : 0;
  const isWarning = hasLimit && percentage >= 80;

  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
        API Requests (this month)
      </p>
      <p className="text-2xl font-bold mt-1">
        {data.current.toLocaleString()}
        {hasLimit && (
          <span className="text-base font-normal text-muted-foreground">
            {' '}
            / {data.limit!.toLocaleString()}
          </span>
        )}
      </p>
      {hasLimit && (
        <div className="mt-2">
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className={`h-2 rounded-full transition-all ${
                data.exceeded ? 'bg-destructive' : getProgressColor(isWarning)
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
          {data.exceeded && (
            <p className="text-xs text-destructive mt-1">
              Limit exceeded — API requests are being rejected
            </p>
          )}
          {isWarning && !data.exceeded && (
            <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
              Approaching limit ({Math.round(percentage)}% used)
            </p>
          )}
        </div>
      )}
      {!hasLimit && (
        <p className="text-xs text-muted-foreground mt-0.5">No limit set</p>
      )}
    </div>
  );
}
