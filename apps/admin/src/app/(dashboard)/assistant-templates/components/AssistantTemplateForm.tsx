'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  createAssistantTemplateAction,
  updateAssistantTemplateAction,
  type AssistantTemplateRow,
} from '../actions';

function getSubmitLabel(isPending: boolean, isEdit: boolean) {
  if (isPending) {
    return 'Saving...';
  }
  if (isEdit) {
    return 'Save changes';
  }
  return 'Create template';
}

type Props = {
  template?: AssistantTemplateRow | null;
};

export function AssistantTemplateForm({ template }: Props) {
  const isEdit = Boolean(template);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [instructions, setInstructions] = useState(
    template?.instructions ?? '',
  );
  const [iconUrl, setIconUrl] = useState(template?.iconUrl ?? '');
  const [sortOrder, setSortOrder] = useState(template?.sortOrder ?? 0);
  const [isActive, setIsActive] = useState(template?.isActive ?? true);

  const [previewMode, setPreviewMode] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!instructions.trim()) {
      toast.error('Instructions are required');
      return;
    }

    startTransition(async () => {
      try {
        if (isEdit && template) {
          await updateAssistantTemplateAction(template.id, {
            name: name.trim(),
            description: description.trim() || null,
            instructions: instructions.trim(),
            iconUrl: iconUrl.trim() || null,
            sortOrder,
            isActive,
          });
          toast.success('Template updated');
        } else {
          await createAssistantTemplateAction({
            name: name.trim(),
            description: description.trim() || undefined,
            instructions: instructions.trim(),
            iconUrl: iconUrl.trim() || undefined,
            sortOrder,
          });
          toast.success('Template created');
          router.push('/assistant-templates');
        }
      } catch {
        toast.error(
          isEdit ? 'Failed to update template' : 'Failed to create template',
        );
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name */}
      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium">
          Name <span className="text-destructive">*</span>
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., HR Assistant"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          required
        />
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium">
          Description
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description visible to users"
          rows={2}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Icon URL */}
      <div>
        <label htmlFor="iconUrl" className="mb-1 block text-sm font-medium">
          Icon URL
        </label>
        <div className="flex items-center gap-3">
          <input
            id="iconUrl"
            type="url"
            value={iconUrl}
            onChange={(e) => setIconUrl(e.target.value)}
            placeholder="https://example.com/icon.png"
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {iconUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={iconUrl}
              alt="Icon preview"
              className="h-10 w-10 rounded border border-border object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
        </div>
      </div>

      {/* Instructions */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor="instructions" className="block text-sm font-medium">
            Master Prompt <span className="text-destructive">*</span>
          </label>
          <div className="flex gap-1 rounded-md border border-border p-0.5">
            <button
              type="button"
              onClick={() => setPreviewMode(false)}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                !previewMode
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode(true)}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                previewMode
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Preview
            </button>
          </div>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">
          Hidden from users. Sent to the AI as system prompt.
        </p>
        {previewMode ? (
          <div className="min-h-[300px] rounded-md border border-border bg-background p-4 prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
            {instructions || (
              <span className="text-muted-foreground italic">
                Nothing to preview
              </span>
            )}
          </div>
        ) : (
          <textarea
            id="instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Enter the system prompt for this assistant..."
            rows={15}
            className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            required
          />
        )}
      </div>

      {/* Sort Order + Active */}
      <div className="flex items-end gap-6">
        <div>
          <label htmlFor="sortOrder" className="mb-1 block text-sm font-medium">
            Sort Order
          </label>
          <input
            id="sortOrder"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            className="w-24 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {isEdit && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-border"
            />
            Active
          </label>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 border-t border-border pt-4">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {getSubmitLabel(isPending, isEdit)}
        </button>
        <a
          href="/assistant-templates"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
