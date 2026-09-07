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

type ApiKeyDto = {
  id: string;
  name: string;
  maskedValue: string;
  isActive: boolean;
  debugMode: boolean;
  createdAt: Date;
};

type ApiKeysListProps = {
  initialKeys: ApiKeyDto[];
};

export function ApiKeysList({ initialKeys }: ApiKeysListProps) {
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
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = () => {
    if (name.length < 3) {
      setCreateError(t('name-is-to-short'));
      return;
    }

    setCreateError(null);
    startTransition(async () => {
      try {
        const result = await createApiKey(name, debugMode);
        setCreatedKey(result.fullKey);
        setCreateOpen(false);
        setName('');
        setDebugMode(false);
        setKeys((prev) => [
          {
            id: result.id,
            name: result.name,
            maskedValue: result.maskedValue,
            isActive: true,
            debugMode,
            createdAt: new Date(),
          },
          ...prev,
        ]);
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
        <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                <th className="px-4 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">
                  {t('name')}
                </th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">
                  {t('secret-key')}
                </th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">
                  {t('created')}
                </th>
                <th className="px-4 py-3 text-center font-medium text-zinc-500 dark:text-zinc-400">
                  {t('debug-mode')}
                </th>
                <th className="px-4 py-3 text-center font-medium text-zinc-500 dark:text-zinc-400">
                  {t('active')}
                </th>
                <th className="px-4 py-3 text-right font-medium text-zinc-500 dark:text-zinc-400">
                  &nbsp;
                </th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr
                  key={key.id}
                  className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                >
                  <td className="px-4 py-3 font-medium text-zinc-950 dark:text-white">
                    {key.name}
                  </td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                      {key.maskedValue}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
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
                        <TrashIcon className="size-4 text-red-500" />
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
            setName('');
            setDebugMode(false);
            setCreateError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('title-create')}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-950 dark:text-white">
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
            <label className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 px-3 py-3 cursor-pointer dark:border-zinc-700">
              <div>
                <span className="block text-sm font-medium text-zinc-950 dark:text-white">
                  {t('debug-mode')}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {t('debug-mode-description')}
                </span>
              </div>
              <input
                type="checkbox"
                checked={debugMode}
                onChange={(e) => setDebugMode(e.target.checked)}
                className="h-5 w-5 rounded border-zinc-300 text-primary focus:ring-primary dark:border-zinc-600"
              />
            </label>
            {createError && (
              <p className="text-sm text-red-500">{createError}</p>
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
          <div className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900">
            <code className="flex-1 break-all text-xs text-zinc-950 dark:text-white">
              {createdKey}
            </code>
            <button
              onClick={() => createdKey && handleCopy(createdKey)}
              className="shrink-0 rounded p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800"
            >
              {copied ? (
                <CheckIcon className="size-4 text-green-500" />
              ) : (
                <ClipboardDocumentIcon className="size-4 text-zinc-500" />
              )}
            </button>
          </div>
          {copied && (
            <p className="text-sm text-green-600">
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
