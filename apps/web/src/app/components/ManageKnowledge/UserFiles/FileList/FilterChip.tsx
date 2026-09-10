'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDownIcon, XMarkIcon } from '@heroicons/react/20/solid';

import { cn } from '@/lib/utils';

/**
 * One filter, showing what it is currently set to.
 *
 * Design system v2 phase 7: filters are chips above the table carrying their
 * value, an `×` once set, and a `Clear all` beside them. A control labelled
 * only "Type" makes you open it to find out whether it is doing anything —
 * the value belongs on the face of it.
 *
 * This replaces two files that were the same component with different option
 * lists (`FileTypeFilterDropdown`, `EmbeddingStatusFilterDropdown`), down to
 * the outside-click effect. The `×` had to be added to both or neither, and
 * the second copy is how one of them ends up without it.
 *
 * The clear button is a **sibling** of the trigger, not inside it. Nested
 * buttons are invalid HTML and browsers resolve the click differently, so
 * "clear this filter" would sometimes have opened the menu instead.
 */

export type FilterOption<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  /** The filter's name, `Type` or `Status`. */
  name: string;
  /** Shown as the value when nothing is selected: `All`. */
  allLabel: string;
  options: readonly FilterOption<T>[];
  selected: readonly T[];
  onChange: (next: T[]) => void;
  /** Width of the menu; the option labels differ in length per filter. */
  menuWidthClassName?: string;
  'data-testid'?: string;
};

export function FilterChip<T extends string>({
  name,
  allLabel,
  options,
  selected,
  onChange,
  menuWidthClassName = 'w-48',
  'data-testid': testId,
}: Props<T>) {
  const t = useTranslations('files-table');
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    // Escape as well as a click away: a menu that can only be dismissed by
    // clicking elsewhere is a menu a keyboard cannot get out of.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const isSet = selected.length > 0;
  const labelOf = (value: T) =>
    options.find((option) => option.value === value)?.label ?? value;

  /**
   * One value, then a count. A chip that grows to "PDF, DOCX, MD, TXT, CSV"
   * stops being a chip and pushes the rest of the bar off the row; the full
   * list is one click away in the menu, and the trigger's accessible name
   * carries it for anyone not looking at the chip.
   */
  const shortValue = (() => {
    if (!isSet) {
      return allLabel;
    }
    const first = labelOf(selected[0]);
    return selected.length === 1 ? first : `${first} +${selected.length - 1}`;
  })();

  const fullValue = isSet ? selected.map(labelOf).join(', ') : allLabel;

  const toggle = (value: T) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  };

  return (
    <div ref={container} className="relative">
      <div
        data-testid={testId}
        data-active={isSet}
        className={cn(
          'flex items-center rounded-md border text-sm',
          isSet
            ? 'border-primary/40 bg-accent text-accent-foreground'
            : 'border-border bg-card text-foreground dark:bg-muted',
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((wasOpen) => !wasOpen)}
          aria-expanded={open}
          aria-haspopup="true"
          aria-controls={open ? menuId : undefined}
          // The chip shows an abbreviated value; the accessible name is the
          // whole of it.
          aria-label={`${name}: ${fullValue}`}
          title={`${name}: ${fullValue}`}
          className="flex items-center gap-1 rounded-md px-3 py-1.5"
        >
          <span>
            {name}: {shortValue}
          </span>
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        </button>
        {isSet ? (
          <button
            type="button"
            onClick={() => onChange([])}
            aria-label={t('filter-clear', { filter: name })}
            data-testid={testId ? `${testId}-clear` : undefined}
            className="rounded-md py-1.5 pr-2 pl-0.5 text-muted-foreground hover:text-foreground"
          >
            <XMarkIcon className="size-4" />
          </button>
        ) : null}
      </div>
      {open ? (
        <div
          id={menuId}
          className={cn(
            'absolute left-0 z-20 mt-1 rounded-md border border-border bg-card shadow-lg dark:bg-muted',
            menuWidthClassName,
          )}
        >
          {options.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted dark:hover:bg-paper-700"
            >
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                onChange={() => toggle(option.value)}
                className="size-4 rounded border-border accent-primary"
              />
              {option.label}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
