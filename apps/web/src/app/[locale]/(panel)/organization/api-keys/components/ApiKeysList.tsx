'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  PlusIcon,
  TrashIcon,
  ClipboardDocumentIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  createApiKey,
  deleteApiKey,
  toggleApiKey,
  toggleDebugMode,
} from '../actions';
import type { KnowledgeScope } from '@ragenai/platform-contracts';

type ApiKeyDto = {
  id: string;
  name: string;
  maskedValue: string;
  isActive: boolean;
  debugMode: boolean;
  createdAt: Date;
  knowledgeScope: KnowledgeScope;
  projectId: string | null;
  project?: { title: string | null } | null;
};

type Assistant = { id: string; title: string | null };

type ApiKeysListProps = {
  initialKeys: ApiKeyDto[];
  assistants: Assistant[];
};

export function ApiKeysList({ initialKeys, assistants }: ApiKeysListProps) {
  const t = useTranslations('api-keys');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [keys, setKeys] = useState(initialKeys);
  const [createOpen, setCreateOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [deleteKeyId, setDeleteKeyId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Create form state
  const [name, setName] = useState('');
  const [debugMode, setDebugMode] = useState(false);
  // The default matches the column default and DEFAULT_KNOWLEDGE_SCOPE: a key
  // nobody thought about reaches the knowledge base, never an assistant.
  const [knowledgeScope, setKnowledgeScope] =
    useState<KnowledgeScope>('KNOWLEDGE_BASE');
  const [projectId, setProjectId] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const resetCreateForm = () => {
    setName('');
    setDebugMode(false);
    setKnowledgeScope('KNOWLEDGE_BASE');
    setProjectId('');
    setCreateError(null);
  };

  const describeScope = (key: ApiKeyDto) =>
    key.knowledgeScope === 'ASSISTANT'
      ? (key.project?.title ?? t('assistant'))
      : t('scope-knowledge-base');

  const handleCreate = () => {
    if (name.length < 3) {
      setCreateError(t('name-is-to-short'));
      return;
    }

    if (knowledgeScope === 'ASSISTANT' && !projectId) {
      setCreateError(t('project-is-required'));
      return;
    }

    setCreateError(null);
    startTransition(async () => {
      try {
        const scopedToAssistant = knowledgeScope === 'ASSISTANT';
        const result = await createApiKey({
          name,
          debugMode,
          knowledgeScope,
          ...(scopedToAssistant ? { projectId } : {}),
        });
        const chosenAssistant = assistants.find((a) => a.id === projectId);
        setCreatedKey(result.fullKey);
        setCreateOpen(false);
        setKeys((prev) => [
          {
            id: result.id,
            name: result.name,
            maskedValue: result.maskedValue,
            isActive: true,
            debugMode,
            createdAt: new Date(),
            knowledgeScope,
            projectId: scopedToAssistant ? projectId : null,
            project: scopedToAssistant
              ? { title: chosenAssistant?.title ?? null }
              : null,
          },
          ...prev,
        ]);
        resetCreateForm();
      } catch {
        setCreateError(t('failed-to-load'));
      }
    });
  };

  const handleDelete = (keyId: string) => {
    startTransition(async () => {
      try {
        await deleteApiKey(keyId);
        setKeys((prev) => prev.filter((k) => k.id !== keyId));
        setDeleteKeyId(null);
        router.refresh();
      } catch {
        setDeleteKeyId(null);
      }
    });
  };

  const handleToggle = (keyId: string, isActive: boolean) => {
    const previousState = keys.find((k) => k.id === keyId)?.isActive;
    setKeys((prev) =>
      prev.map((k) => (k.id === keyId ? { ...k, isActive } : k)),
    );
    startTransition(async () => {
      try {
        await toggleApiKey(keyId, isActive);
      } catch {
        // Rollback on failure
        setKeys((prev) =>
          prev.map((k) =>
            k.id === keyId ? { ...k, isActive: previousState ?? !isActive } : k,
          ),
        );
      }
    });
  };

  const handleToggleDebug = (keyId: string, enabled: boolean) => {
    const previous = keys.find((k) => k.id === keyId)?.debugMode;
    setKeys((prev) =>
      prev.map((k) => (k.id === keyId ? { ...k, debugMode: enabled } : k)),
    );
    startTransition(async () => {
      try {
        await toggleDebugMode(keyId, enabled);
      } catch {
        setKeys((prev) =>
          prev.map((k) =>
            k.id === keyId ? { ...k, debugMode: previous ?? !enabled } : k,
          ),
        );
      }
    });
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access denied
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setCreateOpen(true);
            setCreateError(null);
          }}
        >
          <PlusIcon className="size-4" />
          {t('create-key')}
        </Button>
      </div>

      {keys.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted dark:bg-card">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  {t('name')}
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  {t('scope')}
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  {t('secret-key')}
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  {t('created')}
                </th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                  {t('debug-mode')}
                </th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                  {t('active')}
                </th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                  &nbsp;
                </th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr
                  key={key.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    {key.name}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {describeScope(key)}
                  </td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {key.maskedValue}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(key.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center">
                      <Switch
                        checked={key.debugMode}
                        onCheckedChange={(checked) =>
                          handleToggleDebug(key.id, checked)
                        }
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center">
                      <Switch
                        checked={key.isActive}
                        onCheckedChange={(checked) =>
                          handleToggle(key.id, checked)
                        }
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        onClick={() => setDeleteKeyId(key.id)}
                        disabled={isPending}
                      >
                        <TrashIcon className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            resetCreateForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('title-create')}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                {t('name')}
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreate();
                  }
                }}
                autoFocus
              />
            </div>
            <fieldset>
              <legend className="mb-1.5 block text-sm font-medium text-foreground">
                {t('scope')}
              </legend>
              <div className="flex flex-col gap-2">
                <label className="flex items-start gap-3 rounded-lg border border-border px-3 py-3 cursor-pointer">
                  <input
                    type="radio"
                    name="knowledge-scope"
                    className="mt-0.5 size-4 border-border text-primary focus:ring-primary"
                    checked={knowledgeScope === 'KNOWLEDGE_BASE'}
                    onChange={() => {
                      setKnowledgeScope('KNOWLEDGE_BASE');
                      setProjectId('');
                    }}
                  />
                  <span>
                    <span className="block text-sm font-medium text-foreground">
                      {t('scope-knowledge-base')}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t('scope-knowledge-base-description')}
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-3 rounded-lg border border-border px-3 py-3 cursor-pointer">
                  <input
                    type="radio"
                    name="knowledge-scope"
                    className="mt-0.5 size-4 border-border text-primary focus:ring-primary"
                    checked={knowledgeScope === 'ASSISTANT'}
                    onChange={() => setKnowledgeScope('ASSISTANT')}
                  />
                  <span>
                    <span className="block text-sm font-medium text-foreground">
                      {t('scope-assistant')}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t('scope-assistant-description')}
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>

            {knowledgeScope === 'ASSISTANT' && (
              <div>
                <label
                  htmlFor="api-key-assistant"
                  className="mb-1.5 block text-sm font-medium text-foreground"
                >
                  {t('assistant')}
                </label>
                <select
                  id="api-key-assistant"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-primary"
                >
                  <option value="">{t('select-assistant')}</option>
                  {assistants.map((assistant) => (
                    <option key={assistant.id} value={assistant.id}>
                      {assistant.title ?? assistant.id}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <label className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-3 cursor-pointer">
              <div>
                <span className="block text-sm font-medium text-foreground">
                  {t('debug-mode')}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t('debug-mode-description')}
                </span>
              </div>
              <input
                type="checkbox"
                checked={debugMode}
                onChange={(e) => setDebugMode(e.target.checked)}
                className="h-5 w-5 rounded border-border text-primary focus:ring-primary"
              />
            </label>
            {createError && (
              <p className="text-sm text-destructive">{createError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              {t('dialog.cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={isPending}>
              {t('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Key Created Dialog */}
      <Dialog
        open={!!createdKey}
        onOpenChange={(open) => {
          if (!open) {
            setCreatedKey(null);
            setCopied(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t('dialog.api-key-generated.title')}</DialogTitle>
            <DialogDescription>
              {t('dialog.api-key-generated.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted p-3 dark:bg-card">
            <code className="flex-1 break-all text-xs text-foreground">
              {createdKey}
            </code>
            <button
              onClick={() => createdKey && handleCopy(createdKey)}
              className="shrink-0 rounded p-1 hover:bg-paper-200 dark:hover:bg-muted"
            >
              {copied ? (
                <CheckIcon className="size-4 text-ready" />
              ) : (
                <ClipboardDocumentIcon className="size-4 text-muted-foreground" />
              )}
            </button>
          </div>
          {copied && (
            <p className="text-sm text-ready">
              {t('dialog.api-key-generated.copied')}
            </p>
          )}
          <DialogFooter>
            <Button
              onClick={() => {
                setCreatedKey(null);
                setCopied(false);
              }}
            >
              {t('done')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteKeyId}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteKeyId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('dialog.remove-key.title')}</DialogTitle>
            <DialogDescription>
              {t('dialog.remove-key.description')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteKeyId(null)}>
              {t('dialog.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteKeyId && handleDelete(deleteKeyId)}
              disabled={isPending}
            >
              {t('dialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
