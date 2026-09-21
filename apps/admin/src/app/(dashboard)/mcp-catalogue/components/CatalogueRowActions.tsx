'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import {
  deleteCatalogueEntryAction,
  setCatalogueEntryEnabledAction,
} from '../actions';
import type { CatalogueEntryInput } from '../validation';
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
              onClick={() => setEditing((open) => !open)}
              className="rounded-md border border-border px-2 py-1 text-xs"
            >
              {editing ? 'Close' : 'Edit'}
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

      {editing ? (
        <div className="rounded-lg border border-border p-4">
          <CatalogueEntryForm
            entry={{ ...entry, publicId }}
            onDone={() => setEditing(false)}
          />
        </div>
      ) : null}
    </div>
  );
}
