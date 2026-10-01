'use client';

import { useState, useTransition } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/app/components/ConfirmDialog';
import { Link, useRouter } from '@/i18n/routing';
import {
  MEMORY_MAX_CHARS,
  type UserMemoryView,
} from '@/features/memory/contracts/memory.types';
import {
  deleteMemoryAction,
  forgetAllMemoriesAction,
  setMemoryExtractionAction,
  updateMemoryAction,
  type MemoryActionResult,
  type MemoryPageData,
} from './actions';

type Props = { data: MemoryPageData };

/**
 * The user's own memories (spec 2026-09-27-personal-memory-across-threads,
 * B2): list, edit, delete, forget everything and the extraction switch.
 * While the organization has the feature off, the page offers "forget
 * everything" and nothing else — erasure is always available.
 */
export function MemorySettingsView({ data }: Props) {
  const t = useTranslations('settings-page.memory');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmForget, setConfirmForget] = useState(false);

  const act = (
    action: () => Promise<MemoryActionResult>,
    successKey: string,
    then?: () => void,
  ) =>
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        toast.success(t(successKey));
        then?.();
        router.refresh();
      } else {
        toast.error(
          t(result.error === 'not_found' ? 'error-not-found' : 'error'),
        );
      }
    });

  const forgetEverything = (
    <>
      <Button
        variant="destructive"
        size="sm"
        disabled={isPending}
        onClick={() => setConfirmForget(true)}
      >
        {t('forget-all')}
      </Button>
      <ConfirmDialog
        open={confirmForget}
        onOpenChange={setConfirmForget}
        title={t('forget-confirm-title')}
        description={t('forget-confirm-description')}
        confirmLabel={t('forget-confirm-action')}
        destructive
        onConfirm={() => {
          setConfirmForget(false);
          act(forgetAllMemoriesAction, 'forgotten');
        }}
      />
    </>
  );

  const renderList = () => {
    if (data.listUnavailable) {
      return (
        <p className="py-4 text-sm text-muted-foreground">
          {t('list-unavailable')}
        </p>
      );
    }
    if (data.memories.length === 0) {
      return <p className="py-4 text-sm text-muted-foreground">{t('empty')}</p>;
    }
    return (
      <ul className="mt-3 divide-y divide-border rounded-md border border-border">
        {data.memories.map((memory) => (
          <MemoryRow
            key={memory.publicId}
            memory={memory}
            disabled={isPending}
            onSave={(content, done) =>
              act(
                () => updateMemoryAction(memory.publicId, content),
                'saved',
                done,
              )
            }
            onDelete={() =>
              act(() => deleteMemoryAction(memory.publicId), 'deleted')
            }
          />
        ))}
      </ul>
    );
  };

  if (!data.enabled) {
    return (
      <section className="space-y-3">
        <p className="text-sm text-foreground">{t('off')}</p>
        {data.storedCount > 0 ? (
          <>
            <p className="text-sm text-muted-foreground">
              {t('off-stored', { count: data.storedCount })}
            </p>
            {forgetEverything}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t('off-nothing')}</p>
        )}
      </section>
    );
  }

  return (
    <>
      <section className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {t('switch-label')}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('switch-description')}
          </p>
        </div>
        <Switch
          aria-label={t('switch-label')}
          checked={data.extractionEnabled}
          disabled={isPending}
          onCheckedChange={(enabled) =>
            act(
              () => setMemoryExtractionAction(enabled),
              enabled ? 'switched-on' : 'switched-off',
            )
          }
          className="shrink-0"
        />
      </section>

      <hr className="border-border" />

      <section>
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-sm font-semibold text-foreground">
            {t('list-title')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t('count', { count: data.memories.length, max: data.maxEntries })}
          </p>
        </div>

        {renderList()}
      </section>

      {data.storedCount > 0 && (
        <>
          <hr className="border-border" />
          <section className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {t('forget-all-description')}
            </p>
            {forgetEverything}
          </section>
        </>
      )}
    </>
  );
}

function MemoryRow({
  memory,
  disabled,
  onSave,
  onDelete,
}: {
  memory: UserMemoryView;
  disabled: boolean;
  onSave: (content: string, done: () => void) => void;
  onDelete: () => void;
}) {
  const t = useTranslations('settings-page.memory');
  const format = useFormatter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(memory.content);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const trimmed = draft.trim();
  const invalid = trimmed.length === 0 || trimmed.length > MEMORY_MAX_CHARS;

  return (
    <li className="px-4 py-3">
      {editing ? (
        <div className="space-y-2">
          <Textarea
            aria-label={t('edit-label')}
            value={draft}
            maxLength={MEMORY_MAX_CHARS}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={disabled || invalid}
              onClick={() => onSave(trimmed, () => setEditing(false))}
            >
              {t('save')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => {
                setDraft(memory.content);
                setEditing(false);
              }}
            >
              {t('cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-foreground">{memory.content}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {memory.sourceThread ? (
                <Link
                  href={`/chats/${memory.sourceThread.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {memory.sourceThread.title
                    ? t('from-thread', { title: memory.sourceThread.title })
                    : t('from-untitled')}
                </Link>
              ) : (
                t('from-none')
              )}
              {memory.expiresAt && (
                <>
                  {' · '}
                  {t('until', {
                    date: format.dateTime(new Date(memory.expiresAt), {
                      dateStyle: 'medium',
                    }),
                  })}
                </>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => setEditing(true)}
            >
              {t('edit')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => setConfirmDelete(true)}
            >
              {t('delete')}
            </Button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('delete-confirm-title')}
        description={t('delete-confirm-description')}
        confirmLabel={t('delete')}
        destructive
        onConfirm={() => {
          setConfirmDelete(false);
          onDelete();
        }}
      />
    </li>
  );
}
