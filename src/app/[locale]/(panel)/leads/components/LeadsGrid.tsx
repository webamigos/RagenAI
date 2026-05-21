'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react';
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type ColumnPinningState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  type Table,
} from '@tanstack/react-table';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  ArrowPathIcon,
  ChevronUpDownIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  SparklesIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { LeadEnrichmentStatus } from '@/generated/prisma/enums';
import { enrichLead } from '@/app/actions/leads';
import type { LeadColumn } from '@/features/leads/contracts/lead-column.types';
import type { LeadDto } from '@/features/leads/contracts/lead-list.types';
import { ManualNipModal } from './ManualNipModal';

const ROW_NUMBER_WIDTH = 56;
const ACTION_COL_WIDTH = 110;
const DEFAULT_COL_WIDTH = 180;

const STATUS_LABEL_KEYS = {
  [LeadEnrichmentStatus.idle]: 'status-idle',
  [LeadEnrichmentStatus.pending]: 'status-pending',
  [LeadEnrichmentStatus.enriched]: 'status-enriched',
  [LeadEnrichmentStatus.failed]: 'status-failed',
} as const;

const STATUS_CLASSES = {
  [LeadEnrichmentStatus.idle]: 'text-zinc-500',
  [LeadEnrichmentStatus.pending]:
    'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  [LeadEnrichmentStatus.enriched]:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  [LeadEnrichmentStatus.failed]:
    'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
} as const;

function formatCell(value: unknown, type: LeadColumn['type']): string {
  if (value == null || value === '') {
    return '';
  }
  if (type === 'boolean') {
    return value ? '✓' : '✗';
  }
  if (type === 'number' && typeof value === 'number') {
    return value.toLocaleString();
  }
  return String(value);
}

// Comparable scalar for sorting — keep nulls/empties at the bottom and respect
// the column's declared type so numbers sort numerically.
function comparableValue(
  value: unknown,
  type: LeadColumn['type'],
): number | string | null {
  if (value == null || value === '') {
    return null;
  }
  if (type === 'number') {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (type === 'boolean') {
    return value ? 1 : 0;
  }
  return String(value).toLocaleLowerCase();
}

type GridRow = {
  lead: LeadDto;
  // Flattened cell values for TanStack's accessor-based sorting.
  [key: string]: unknown;
};

const SELECT_ID = '_select';
const ROW_NUM_ID = '_rowNumber';
const ACTION_ID = '_action';
const SELECT_COL_WIDTH = 40;

type EnrichmentContextValue = {
  optimisticStatuses: Record<string, LeadEnrichmentStatus>;
  inFlight: Set<string>;
  onEnrich: (lead: LeadDto) => void;
  onOpenManual: (lead: LeadDto) => void;
};

const EnrichmentContext = createContext<EnrichmentContextValue | null>(null);

function ActionCell({ lead }: { lead: LeadDto }) {
  const t = useTranslations('leads-page');
  const ctx = useContext(EnrichmentContext);
  if (!ctx) {
    return null;
  }
  const status = ctx.optimisticStatuses[lead.publicId] ?? lead.enrichmentStatus;
  const isEnriching = ctx.inFlight.has(lead.publicId);
  const enrichLabel = `${t('enrich-button')} (${t('row-count', {
    count: lead.rowIndex + 1,
  })})`;
  return (
    <div className="flex items-center gap-2">
      <span
        className={clsx(
          'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
          STATUS_CLASSES[status],
        )}
      >
        {t(STATUS_LABEL_KEYS[status])}
      </span>
      {status === LeadEnrichmentStatus.failed && (
        <button
          type="button"
          onClick={() => ctx.onOpenManual(lead)}
          aria-label={t('manual-enrich-title')}
          className="inline-flex items-center rounded px-1.5 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          <WrenchScrewdriverIcon className="size-3.5" />
        </button>
      )}
      <button
        type="button"
        onClick={() => ctx.onEnrich(lead)}
        disabled={isEnriching}
        aria-label={enrichLabel}
        className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        {isEnriching ? (
          <ArrowPathIcon className="size-3.5 animate-spin" />
        ) : (
          <SparklesIcon className="size-3.5" />
        )}
      </button>
    </div>
  );
}

const COLUMN_MIN_WIDTHS: Record<string, number> = {
  [SELECT_ID]: SELECT_COL_WIDTH,
  [ROW_NUM_ID]: ROW_NUMBER_WIDTH,
  [ACTION_ID]: ACTION_COL_WIDTH,
};

const NO_MAX_WIDTH_COLUMNS = new Set([SELECT_ID, ROW_NUM_ID, ACTION_ID]);

function minWidthFor(columnId: string): number {
  return COLUMN_MIN_WIDTHS[columnId] ?? DEFAULT_COL_WIDTH;
}

function maxWidthFor(columnId: string): number | undefined {
  return NO_MAX_WIDTH_COLUMNS.has(columnId) ? undefined : DEFAULT_COL_WIDTH * 2;
}

function renderHeaderContent(
  header: import('@tanstack/react-table').Header<GridRow, unknown>,
  canSort: boolean,
  sortDir: 'asc' | 'desc' | false,
) {
  if (header.isPlaceholder) {
    return null;
  }
  const rendered = flexRender(
    header.column.columnDef.header,
    header.getContext(),
  );
  if (!canSort) {
    return rendered;
  }
  return (
    <button
      type="button"
      onClick={header.column.getToggleSortingHandler()}
      className="inline-flex w-full items-center gap-1 text-left hover:text-zinc-900 dark:hover:text-white"
    >
      <span className="truncate">{rendered}</span>
      {sortIndicator(sortDir)}
    </button>
  );
}

function sortIndicator(sortDir: 'asc' | 'desc' | false) {
  if (sortDir === 'asc') {
    return <ChevronUpIcon className="size-3 shrink-0" />;
  }
  if (sortDir === 'desc') {
    return <ChevronDownIcon className="size-3 shrink-0" />;
  }
  return <ChevronUpDownIcon className="size-3 shrink-0 opacity-30" />;
}

function cellBackgroundClass(
  isPinned: boolean | 'left' | 'right',
  source: string | undefined,
): string {
  if (isPinned) {
    return 'bg-white dark:bg-zinc-950';
  }
  if (source === 'enrichment') {
    return 'bg-violet-50/30 dark:bg-violet-950/15';
  }
  return 'bg-white dark:bg-zinc-950';
}

function pinStyles<TData>(column: Column<TData>): CSSProperties {
  const pinned = column.getIsPinned();
  if (!pinned) {
    return {};
  }
  if (pinned === 'left') {
    return { position: 'sticky', left: column.getStart('left'), zIndex: 2 };
  }
  return { position: 'sticky', right: column.getAfter('right'), zIndex: 2 };
}

type Props = {
  columns: LeadColumn[];
  leads: LeadDto[];
  pageSize: number;
  onPageSizeChange: (n: number) => void;
  // Render prop exposing the table instance so the parent can mount toolbar UI.
  renderToolbar?: (table: Table<GridRow>) => React.ReactNode;
  // Render prop for the bulk-action bar shown when rows are selected.
  // Receives selected lead publicIds and a function to clear the selection.
  renderBulkBar?: (args: {
    selectedIds: string[];
    clearSelection: () => void;
  }) => React.ReactNode;
  // Optional notifier so the parent can react to selection changes (e.g. to
  // scope the assistant drawer to the current selection).
  onSelectionChange?: (selectedIds: string[]) => void;
};

export function LeadsGrid({
  columns,
  leads,
  pageSize,
  onPageSizeChange,
  renderToolbar,
  renderBulkBar,
  onSelectionChange,
}: Props) {
  const t = useTranslations('leads-page');
  const router = useRouter();
  const [optimisticStatuses, setOptimisticStatuses] = useState<
    Record<string, LeadEnrichmentStatus>
  >({});
  const [inFlight, setInFlight] = useState<Set<string>>(() => new Set());
  const [nipModalLead, setNipModalLead] = useState<LeadDto | null>(null);

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({
    left: [SELECT_ID, ROW_NUM_ID],
    right: [ACTION_ID],
  });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const clearOptimistic = useCallback((publicId: string) => {
    setOptimisticStatuses((s) => {
      if (!(publicId in s)) {
        return s;
      }
      const next = { ...s };
      delete next[publicId];
      return next;
    });
    setInFlight((s) => {
      if (!s.has(publicId)) {
        return s;
      }
      const next = new Set(s);
      next.delete(publicId);
      return next;
    });
  }, []);

  const handleEnrich = useCallback(
    async (lead: LeadDto) => {
      let added = false;
      setInFlight((s) => {
        if (s.has(lead.publicId)) {
          return s;
        }
        added = true;
        return new Set(s).add(lead.publicId);
      });
      if (!added) {
        return;
      }
      setOptimisticStatuses((s) => ({
        ...s,
        [lead.publicId]: LeadEnrichmentStatus.pending,
      }));
      try {
        const result = await enrichLead({ leadPublicId: lead.publicId });
        if (result.status === 'enriched') {
          toast.success(t('enrich-success'));
        } else if (result.status === 'failed') {
          toast.error(result.error ?? t('enrich-failed'));
        }
        router.refresh();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : t('enrich-failed');
        if (message.includes('infer')) {
          toast.error(t('enrich-no-lookup'));
        } else {
          toast.error(message);
        }
      } finally {
        clearOptimistic(lead.publicId);
      }
    },
    [router, t, clearOptimistic],
  );

  const orderedDataColumns = useMemo(() => {
    const csv = columns.filter((c) => c.source === 'csv');
    const enrichment = columns.filter((c) => c.source === 'enrichment');
    return { csv, enrichment, all: [...csv, ...enrichment] };
  }, [columns]);

  const data = useMemo<GridRow[]>(() => {
    return leads.map((lead) => {
      const row: GridRow = { lead };
      for (const col of orderedDataColumns.all) {
        row[col.key] = lead.data[col.key];
      }
      return row;
    });
  }, [leads, orderedDataColumns.all]);

  const tableColumns = useMemo<ColumnDef<GridRow>[]>(() => {
    const dataCols: ColumnDef<GridRow>[] = orderedDataColumns.all.map(
      (col, idx) => ({
        id: col.key,
        accessorKey: col.key,
        header: col.label,
        enableHiding: true,
        enableSorting: true,
        sortingFn: (a, b) => {
          const av = comparableValue(a.original[col.key], col.type);
          const bv = comparableValue(b.original[col.key], col.type);
          if (av === null && bv === null) {
            return 0;
          }
          if (av === null) {
            return 1;
          }
          if (bv === null) {
            return -1;
          }
          if (typeof av === 'number' && typeof bv === 'number') {
            return av - bv;
          }
          return String(av).localeCompare(String(bv));
        },
        meta: {
          label: col.label,
          source: col.source,
          colType: col.type,
          isEnrichmentBoundary: idx === orderedDataColumns.csv.length,
        },
        cell: ({ getValue }) => formatCell(getValue(), col.type),
      }),
    );

    const selectCol: ColumnDef<GridRow> = {
      id: SELECT_ID,
      header: ({ table }) => (
        <input
          type="checkbox"
          aria-label="Select all rows"
          checked={table.getIsAllPageRowsSelected()}
          ref={(el) => {
            if (el) {
              el.indeterminate =
                !table.getIsAllPageRowsSelected() &&
                table.getIsSomePageRowsSelected();
            }
          }}
          onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
          className="size-4 cursor-pointer rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label={`Select row ${row.original.lead.rowIndex + 1}`}
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          onClick={(e) => e.stopPropagation()}
          className="size-4 cursor-pointer rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800"
        />
      ),
      enableHiding: false,
      enableSorting: false,
      meta: { label: 'Select' },
      size: SELECT_COL_WIDTH,
    };

    const rowNumberCol: ColumnDef<GridRow> = {
      id: ROW_NUM_ID,
      header: '#',
      enableHiding: false,
      enableSorting: false,
      meta: { label: '#' },
      cell: ({ row }) => row.original.lead.rowIndex + 1,
      size: ROW_NUMBER_WIDTH,
    };

    const actionCol: ColumnDef<GridRow> = {
      id: ACTION_ID,
      header: t('enrich-button'),
      enableHiding: false,
      enableSorting: false,
      meta: { label: t('enrich-button') },
      size: ACTION_COL_WIDTH,
      cell: ({ row }) => <ActionCell lead={row.original.lead} />,
    };

    return [selectCol, rowNumberCol, ...dataCols, actionCol];
  }, [orderedDataColumns.all, orderedDataColumns.csv.length, t]);

  const table = useReactTable({
    data,
    columns: tableColumns,
    state: { sorting, columnVisibility, columnPinning, rowSelection },
    enableRowSelection: true,
    getRowId: (row) => row.lead.publicId,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnPinningChange: setColumnPinning,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize, pageIndex: 0 } },
  });

  // Keep TanStack pagination in sync when parent changes pageSize via the
  // bottom selector. (initialState only applies on first render.) Done in
  // an effect so we don't trigger a setState during render.
  useEffect(() => {
    if (table.getState().pagination.pageSize !== pageSize) {
      table.setPageSize(pageSize);
    }
  }, [pageSize, table]);

  const selectedIds = useMemo(
    () => Object.keys(rowSelection).filter((k) => rowSelection[k]),
    [rowSelection],
  );
  const clearSelection = useCallback(() => setRowSelection({}), []);

  useEffect(() => {
    onSelectionChange?.(selectedIds);
    // selectedIds is derived from rowSelection; onSelectionChange identity
    // is the consumer's responsibility (memoize if needed).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds]);

  const pagination = table.getState().pagination;
  const totalRows = data.length;
  const from =
    totalRows === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const to = Math.min(
    totalRows,
    (pagination.pageIndex + 1) * pagination.pageSize,
  );

  const enrichmentCtx = useMemo<EnrichmentContextValue>(
    () => ({
      optimisticStatuses,
      inFlight,
      onEnrich: handleEnrich,
      onOpenManual: setNipModalLead,
    }),
    [optimisticStatuses, inFlight, handleEnrich],
  );

  return (
    <EnrichmentContext.Provider value={enrichmentCtx}>
      <div data-panel-fullwidth className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            {t('page-summary', { from, to, total: totalRows })}
          </div>
          {renderToolbar?.(table)}
        </div>
        {selectedIds.length > 0 && renderBulkBar
          ? renderBulkBar({ selectedIds, clearSelection })
          : null}
        <div
          role="region"
          aria-label={t('title')}
          tabIndex={0}
          className="min-h-0 flex-1 overflow-auto bg-zinc-50 outline-none dark:bg-zinc-950"
        >
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-30 bg-zinc-100 dark:bg-zinc-900">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const meta = header.column.columnDef.meta as
                      | { source?: string; isEnrichmentBoundary?: boolean }
                      | undefined;
                    const isPinned = header.column.getIsPinned();
                    const canSort = header.column.getCanSort();
                    const sortDir = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        style={{
                          ...pinStyles(header.column),
                          minWidth: minWidthFor(header.id),
                        }}
                        className={clsx(
                          'border-b border-r border-zinc-200 px-3 py-2 text-left text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:text-zinc-300',
                          isPinned && 'bg-zinc-100 dark:bg-zinc-900',
                          meta?.source === 'enrichment' &&
                            'bg-violet-50/60 dark:bg-violet-950/30',
                          meta?.isEnrichmentBoundary &&
                            'border-l-2 border-l-violet-300 dark:border-l-violet-700',
                        )}
                      >
                        {renderHeaderContent(header, canSort, sortDir)}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="bg-white dark:bg-zinc-950">
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="group">
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as
                      | { source?: string; isEnrichmentBoundary?: boolean }
                      | undefined;
                    const isPinned = cell.column.getIsPinned();
                    return (
                      <td
                        key={cell.id}
                        style={{
                          ...pinStyles(cell.column),
                          minWidth: minWidthFor(cell.column.id),
                          maxWidth: maxWidthFor(cell.column.id),
                        }}
                        className={clsx(
                          'truncate border-b border-r border-zinc-200 px-3 py-1.5 dark:border-zinc-800',
                          cellBackgroundClass(isPinned, meta?.source),
                          meta?.isEnrichmentBoundary &&
                            'border-l-2 border-l-violet-300 dark:border-l-violet-700',
                          'group-hover:bg-zinc-50 dark:group-hover:bg-zinc-900',
                        )}
                        title={
                          cell.column.id === ACTION_ID
                            ? undefined
                            : String(cell.getValue() ?? '')
                        }
                      >
                        {cell.column.id === SELECT_ID ||
                        cell.column.id === ACTION_ID ||
                        cell.column.id === ROW_NUM_ID ? (
                          flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )
                        ) : (
                          <span className="block truncate">
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <GridPagination
          table={table}
          pageSize={pageSize}
          onPageSizeChange={onPageSizeChange}
        />
        <ManualNipModal
          lead={nipModalLead}
          onClose={() => setNipModalLead(null)}
        />
      </div>
    </EnrichmentContext.Provider>
  );
}

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250, 500];

function GridPagination({
  table,
  pageSize,
  onPageSizeChange,
}: {
  table: Table<GridRow>;
  pageSize: number;
  onPageSizeChange: (n: number) => void;
}) {
  const t = useTranslations('leads-page');
  const { pageIndex } = table.getState().pagination;
  const pageCount = table.getPageCount();
  const canPrev = table.getCanPreviousPage();
  const canNext = table.getCanNextPage();

  return (
    <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-2 dark:border-zinc-800">
      <div className="flex items-center gap-2">
        <label
          htmlFor="page-size-select"
          className="text-sm text-zinc-500 dark:text-zinc-400"
        >
          {t('rows-per-page')}
        </label>
        <select
          id="page-size-select"
          value={pageSize}
          onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {t('page-of', {
            page: Math.min(pageIndex + 1, Math.max(1, pageCount)),
            totalPages: Math.max(1, pageCount),
          })}
        </span>
        <div className="flex items-center gap-1">
          <PageButton
            onClick={() => table.setPageIndex(0)}
            disabled={!canPrev}
            label={t('page-first')}
          >
            «
          </PageButton>
          <PageButton
            onClick={() => table.previousPage()}
            disabled={!canPrev}
            label={t('page-previous')}
          >
            ‹
          </PageButton>
          <PageButton
            onClick={() => table.nextPage()}
            disabled={!canNext}
            label={t('page-next')}
          >
            ›
          </PageButton>
          <PageButton
            onClick={() => table.setPageIndex(pageCount - 1)}
            disabled={!canNext}
            label={t('page-last')}
          >
            »
          </PageButton>
        </div>
      </div>
    </div>
  );
}

function PageButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex size-7 items-center justify-center rounded border border-zinc-300 bg-white text-sm text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
    >
      {children}
    </button>
  );
}
