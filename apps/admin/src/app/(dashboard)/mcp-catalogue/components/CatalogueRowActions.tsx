'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import {
  deleteCatalogueEntryAction,
  setCatalogueEntryEnabledAction,
} from '../actions';
import type { CatalogueEntryInput } from '../validation-shape';
import { CatalogueEntryForm } from './CatalogueEntryForm';

export type CatalogueRowActionsProps = {
  publicId: string;
  slug: string;
  enabled: boolean;
  isBuiltIn: boolean;
  entry: CatalogueEntryInput;
};

export function CatalogueRowActions({
  publicId,
  slug,
  enabled,
  isBuiltIn,
  entry,
}: CatalogueRowActionsProps) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    startTransition(async () => {
      const result = await setCatalogueEntryEnabledAction(publicId, !enabled);
      if (result.ok) {
        toast.success(enabled ? `${slug} disabled.` : `${slug} enabled.`);
      } else {
        toast.error(result.message ?? 'That did not save.');
      }
    });
  };

  const remove = () => {
    startTransition(async () => {
      const result = await deleteCatalogueEntryAction(publicId);
      if (result.ok) {
        toast.success(`${slug} removed from the catalogue.`);
        setConfirmingDelete(false);
      } else {
        // The refusal is the useful part: it says how many connectors still
        // hold the slug, and that disabling reaches the same place.
        toast.error(result.message ?? 'That entry could not be removed.');
      }
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-60"
        >
          {enabled ? 'Disable' : 'Enable'}
        </button>

        {isBuiltIn ? null : (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md border border-border px-2 py-1 text-xs"
            >
              Edit
            </button>
            {confirmingDelete ? (
              <>
                <button
                  type="button"
                  onClick={remove}
                  disabled={pending}
                  className="rounded-md bg-destructive px-2 py-1 text-xs text-destructive-foreground disabled:opacity-60"
                >
                  Confirm delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="rounded-md border border-border px-2 py-1 text-xs"
                >
                  Keep
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="rounded-md border border-border px-2 py-1 text-xs text-destructive"
              >
                Delete
              </button>
            )}
          </>
        )}
      </div>

      {/*
        A dialog rather than a form unfolding inside the actions cell: the
        cell is a table column, and a dozen fields squeezed into it read as
        one long ribbon beside rows that no longer line up.
      */}
      <CatalogueEntryDialog
        open={editing}
        onOpenChange={setEditing}
        title={`Edit ${entry.label || slug}`}
        description={`Changes apply to every organization that uses ${slug} as soon as they are saved.`}
      >
        <CatalogueEntryForm
          entry={{ ...entry, publicId }}
          onDone={() => setEditing(false)}
        />
      </CatalogueEntryDialog>
    </div>
  );
}

/** The catalogue form in a dialog wide and tall enough for all of it. */
export function CatalogueEntryDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
