'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronUpDownIcon, XMarkIcon } from '@heroicons/react/20/solid';
import type {
  AuditLogFilters,
  AuditLogFilterOptions,
} from '@/features/audit-logs/contracts/audit-log.types';

type Props = {
  filters: AuditLogFilters;
  filterOptions: AuditLogFilterOptions | null;
  onChange: (filters: AuditLogFilters) => void;
};

const periodOptions = [
  { value: '1d', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
] as const;

type FilterOption = { value: string; label: string };

function SearchableSelect({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string | undefined;
  options: FilterOption[];
  placeholder: string;
  onChange: (value: string | undefined) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered =
    query === ''
      ? options
      : options.filter((opt) =>
          opt.label.toLowerCase().includes(query.toLowerCase()),
        );

  const selectedLabel = options.find((o) => o.value === value)?.label;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center rounded-md border border-border bg-background text-sm">
        <input
          ref={inputRef}
          type="text"
          className="w-36 bg-transparent px-3 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none"
          placeholder={value ? selectedLabel : placeholder}
          value={isOpen ? query : ''}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) {
              setIsOpen(true);
            }
          }}
          onFocus={() => {
            setIsOpen(true);
            setQuery('');
          }}
        />
        {value ? (
          <button
            type="button"
            className="px-1 text-muted-foreground hover:text-foreground"
            onClick={() => {
              onChange(undefined);
              setQuery('');
            }}
          >
            <XMarkIcon className="size-4" />
          </button>
        ) : (
          <ChevronUpDownIcon className="mr-1 size-4 text-muted-foreground" />
        )}
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 max-h-60 w-56 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted"
            onClick={() => {
              onChange(undefined);
              setIsOpen(false);
              setQuery('');
            }}
          >
            {placeholder}
          </button>
          {filtered.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`w-full truncate px-3 py-2 text-left text-sm hover:bg-muted ${
                opt.value === value
                  ? 'bg-muted font-medium text-foreground'
                  : 'text-foreground'
              }`}
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
                setQuery('');
              }}
            >
              {opt.label}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              No results
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function AuditLogsFiltersBar({
  filters,
  filterOptions,
  onChange,
}: Props) {
  const selectClassName =
    'rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground';

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={filters.period ?? '30d'}
        onChange={(e) =>
          onChange({
            ...filters,
            period: e.target.value as AuditLogFilters['period'],
          })
        }
        className={selectClassName}
      >
        {periodOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {filterOptions && (
        <>
          <SearchableSelect
            value={filters.organizationId}
            placeholder="All organizations"
            options={filterOptions.organizations.map((org) => ({
              value: org.id,
              label: org.name,
            }))}
            onChange={(v) => onChange({ ...filters, organizationId: v })}
          />

          <SearchableSelect
            value={filters.userId}
            placeholder="All users"
            options={filterOptions.users.map((user) => ({
              value: user.id,
              label: user.name ? `${user.name} (${user.email})` : user.email,
            }))}
            onChange={(v) => onChange({ ...filters, userId: v })}
          />

          <SearchableSelect
            value={filters.entityType}
            placeholder="All entity types"
            options={filterOptions.entityTypes.map((type) => ({
              value: type,
              label: type,
            }))}
            onChange={(v) => onChange({ ...filters, entityType: v })}
          />

          <SearchableSelect
            value={filters.action}
            placeholder="All actions"
            options={filterOptions.actions.map((action) => ({
              value: action,
              label: action,
            }))}
            onChange={(v) => onChange({ ...filters, action: v })}
          />
        </>
      )}
    </div>
  );
}
