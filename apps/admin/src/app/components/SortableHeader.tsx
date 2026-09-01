'use client';

import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';

interface SortableHeaderProps {
  label: string;
  field: string;
  currentSort?: string;
  currentOrder?: string;
  baseUrl: string;
  extraParams?: Record<string, string | undefined>;
  className?: string;
}

export function SortableHeader({
  label,
  field,
  currentSort,
  currentOrder,
  baseUrl,
  extraParams = {},
  className = '',
}: SortableHeaderProps) {
  const isActive = currentSort === field;
  const nextOrder = isActive && currentOrder === 'asc' ? 'desc' : 'asc';

  const params = new URLSearchParams();
  params.set('sort', field);
  params.set('order', nextOrder);
  for (const [k, v] of Object.entries(extraParams)) {
    if (v) {
      params.set(k, v);
    }
  }

  let sortIcon = <ArrowUpDown className="h-3 w-3 opacity-30" />;
  if (isActive) {
    sortIcon =
      currentOrder === 'asc' ? (
        <ArrowUp className="h-3 w-3" />
      ) : (
        <ArrowDown className="h-3 w-3" />
      );
  }

  return (
    <th className={`px-4 py-3 font-medium ${className}`}>
      <a
        href={`${baseUrl}?${params.toString()}`}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {label}
        {sortIcon}
      </a>
    </th>
  );
}
