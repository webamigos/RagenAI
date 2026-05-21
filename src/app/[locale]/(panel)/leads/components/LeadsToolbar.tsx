'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Table } from '@tanstack/react-table';
import {
  AdjustmentsHorizontalIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@ragenai/tui/checkbox';
import { toast } from 'sonner';
import type { LeadColumn } from '@/features/leads/contracts/lead-column.types';
import type { LeadDto } from '@/features/leads/contracts/lead-list.types';
import {
  downloadBlob,
  leadsToCsv,
  leadsToXlsx,
  sanitizeFilename,
  type ExportableColumn,
} from '../utils/export-leads';

type GridRowShape = { lead: LeadDto };

type Props<TData extends GridRowShape> = {
  table: Table<TData>;
  columns: LeadColumn[];
  leads: LeadDto[];
  listName: string;
};

export function LeadsToolbar<TData extends GridRowShape>({
  table,
  columns,
  leads,
  listName,
}: Props<TData>) {
  const t = useTranslations('leads-page');
  const [exportOpen, setExportOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);

  const exportableColumns: ExportableColumn[] = columns.map((c) => ({
    key: c.key,
    label: c.label,
    type: c.type,
  }));
  const filename = sanitizeFilename(listName);

  // Export the selection when any rows are selected; otherwise export the
  // whole list. Matches the user-visible "N selected" affordance.
  const getExportRows = (): LeadDto[] => {
    const selectedRows = table.getSelectedRowModel().rows;
    if (selectedRows.length > 0) {
      return selectedRows.map((r) => r.original.lead);
    }
    return leads;
  };

  const handleCsvExport = () => {
    try {
      const csv = leadsToCsv(exportableColumns, getExportRows());
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      downloadBlob(blob, `${filename}.csv`);
      setExportOpen(false);
    } catch {
      toast.error(t('export-failed'));
    }
  };

  const handleXlsxExport = () => {
    try {
      const buffer = leadsToXlsx(exportableColumns, getExportRows(), listName);
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      downloadBlob(blob, `${filename}.xlsx`);
      setExportOpen(false);
    } catch {
      toast.error(t('export-failed'));
    }
  };

  const hidableColumns = table
    .getAllLeafColumns()
    .filter((c) => c.getCanHide());

  return (
    <div className="flex items-center gap-2">
      <Popover open={columnsOpen} onOpenChange={setColumnsOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <AdjustmentsHorizontalIcon className="size-3.5" />
            {t('columns')}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-2">
          <div className="max-h-80 overflow-y-auto">
            {hidableColumns.map((col) => {
              const meta = col.columnDef.meta as { label?: string } | undefined;
              const label = meta?.label ?? col.id;
              return (
                <label
                  key={col.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <Checkbox
                    checked={col.getIsVisible()}
                    onChange={(checked) => col.toggleVisibility(checked)}
                  />
                  <span className="truncate text-zinc-700 dark:text-zinc-200">
                    {label}
                  </span>
                </label>
              );
            })}
          </div>
          <div className="mt-1 border-t border-zinc-200 pt-1 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => table.resetColumnVisibility()}
              className="w-full rounded px-2 py-1.5 text-left text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              {t('columns-reset')}
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <Popover open={exportOpen} onOpenChange={setExportOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <ArrowDownTrayIcon className="size-3.5" />
            {t('export')}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-44 p-1">
          <button
            type="button"
            onClick={handleCsvExport}
            className="block w-full rounded px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {t('export-csv')}
          </button>
          <button
            type="button"
            onClick={handleXlsxExport}
            className="block w-full rounded px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {t('export-xlsx')}
          </button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
