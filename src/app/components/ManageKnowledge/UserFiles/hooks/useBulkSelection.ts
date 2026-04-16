import { useState, useCallback } from 'react';

export type BulkSelectionState = {
  selectedIds: Set<string>;
  isSelected: (id: string) => boolean;
  isAllSelected: (availableIds: string[]) => boolean;
  isIndeterminate: (availableIds: string[]) => boolean;
  toggleFile: (id: string) => void;
  toggleAll: (availableIds: string[]) => void;
  clearAll: () => void;
  selectedCount: number;
};

export function useBulkSelection(): BulkSelectionState {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds],
  );

  const isAllSelected = useCallback(
    (availableIds: string[]) =>
      availableIds.length > 0 &&
      availableIds.every((id) => selectedIds.has(id)),
    [selectedIds],
  );

  const isIndeterminate = useCallback(
    (availableIds: string[]) => {
      const selectedInView = availableIds.filter((id) => selectedIds.has(id));
      return (
        selectedInView.length > 0 && selectedInView.length < availableIds.length
      );
    },
    [selectedIds],
  );

  const toggleFile = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback((availableIds: string[]) => {
    setSelectedIds((prev) => {
      const allSelected = availableIds.every((id) => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        for (const id of availableIds) {
          next.delete(id);
        }
        return next;
      } else {
        const next = new Set(prev);
        for (const id of availableIds) {
          next.add(id);
        }
        return next;
      }
    });
  }, []);

  const clearAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return {
    selectedIds,
    isSelected,
    isAllSelected,
    isIndeterminate,
    toggleFile,
    toggleAll,
    clearAll,
    selectedCount: selectedIds.size,
  };
}
