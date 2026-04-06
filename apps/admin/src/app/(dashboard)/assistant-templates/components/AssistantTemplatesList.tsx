'use client';

import { useState, useTransition } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import {
  toggleAssistantTemplateAction,
  deleteAssistantTemplateAction,
  type AssistantTemplateRow,
} from '../actions';

export function AssistantTemplatesList({
  templates,
}: {
  templates: AssistantTemplateRow[];
}) {
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleToggle = (id: string, currentActive: boolean) => {
    startTransition(async () => {
      try {
        await toggleAssistantTemplateAction(id, !currentActive);
        toast.success(
          `Template ${currentActive ? 'deactivated' : 'activated'}`,
        );
      } catch {
        toast.error('Failed to toggle template');
      }
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      try {
        await deleteAssistantTemplateAction(id);
        setDeleteTarget(null);
        toast.success('Template deleted');
      } catch {
        toast.error('Failed to delete template');
      }
    });
  };

  if (templates.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">No templates yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Create your first assistant template to get started.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Icon</th>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Description</th>
              <th className="px-4 py-3 text-center font-medium">Status</th>
              <th className="px-4 py-3 text-center font-medium">Order</th>
              <th className="px-4 py-3 text-left font-medium">Updated</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr
                key={t.id}
                className="border-b border-border last:border-0 transition-colors hover:bg-muted/50"
              >
                <td className="px-4 py-3">
                  {t.iconUrl ? (
                    <img
                      src={t.iconUrl}
                      alt=""
                      className="h-8 w-8 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-muted text-muted-foreground text-xs">
                      —
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 font-medium">
                  <a
                    href={`/assistant-templates/${t.id}`}
                    className="hover:underline"
                  >
                    {t.name}
                  </a>
                </td>
                <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">
                  {t.description || '—'}
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    type="button"
                    onClick={() => handleToggle(t.id, t.isActive)}
                    disabled={isPending}
                    className="inline-flex items-center"
                  >
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        t.isActive
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                      }`}
                    >
                      {t.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </button>
                </td>
                <td className="px-4 py-3 text-center text-muted-foreground">
                  {t.sortOrder}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDistanceToNow(new Date(t.updatedAt), {
                    addSuffix: true,
                  })}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <a
                      href={`/assistant-templates/${t.id}`}
                      className="text-xs text-primary hover:underline"
                    >
                      Edit
                    </a>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(t.id)}
                      className="text-xs text-destructive hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
            <h3 className="text-lg font-semibold">Delete template</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure? Existing projects from this template will continue
              working but won&apos;t receive instruction updates.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteTarget)}
                disabled={isPending}
                className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                {isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
