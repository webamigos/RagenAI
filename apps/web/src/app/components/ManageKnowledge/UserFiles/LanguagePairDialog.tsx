'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  createDocumentPairAction,
  removeDocumentPairAction,
  suggestDocumentPairsAction,
} from '@/app/actions/document-pairs';
import type { UserFileType } from '@/features/documents/contracts/document.types';
import { piiInconsistency } from '@/features/documents/utils/document-pair';
import {
  languageName,
  shortLanguageTag,
} from '@/features/brain/utils/language-name';
import { logger } from '@/app/lib/utils/logger';

type Suggestion = Awaited<
  ReturnType<typeof suggestDocumentPairsAction>
>[number];

type Props = {
  /** The file whose pair is being managed; null keeps the dialog closed. */
  file: UserFileType | null;
  onClose: () => void;
  /** Called after a pair was created or removed, so the list can refresh. */
  onChanged: (message: string) => void;
};

/**
 * Pair a file with the same document in another language, or remove its pair
 * (ADR-54). Suggestions are asked for when the dialog opens and are only
 * suggestions: nothing is paired until a person presses Pair. Every call goes
 * through a server action, which takes the organization and user from the
 * session.
 */
export function LanguagePairDialog({ file, onClose, onChanged }: Props) {
  const t = useTranslations('document-pairs');
  const locale = useLocale();
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const fileId = file?.id;
  const alreadyPaired = Boolean(file?.pairedWith);

  useEffect(() => {
    setSuggestions(null);
    setFailed(false);
    if (!fileId || alreadyPaired) {
      return;
    }
    let cancelled = false;
    suggestDocumentPairsAction(fileId)
      .then((found) => {
        if (!cancelled) {
          setSuggestions(found);
        }
      })
      .catch((error: unknown) => {
        logger.warn({ err: error }, 'Pair suggestions failed');
        if (!cancelled) {
          setSuggestions([]);
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fileId, alreadyPaired]);

  async function run(
    action: () => Promise<{ ok: boolean }>,
    message: string,
  ): Promise<void> {
    setBusy(true);
    setFailed(false);
    try {
      const result = await action();
      if (result.ok) {
        onChanged(message);
      } else {
        setFailed(true);
      }
    } catch (error) {
      logger.warn({ err: error }, 'Updating a language pair failed');
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const counterpart = file?.pairedWith;
  const language = (code: string | null | undefined) =>
    code ? languageName(code, locale) : t('language-unknown');

  return (
    <Dialog open={file !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {counterpart
              ? t('description-paired', {
                  name: file?.fileName ?? '',
                  counterpart: counterpart.fileName,
                  language: language(counterpart.language),
                })
              : t('description-none', { name: file?.fileName ?? '' })}
          </DialogDescription>
        </DialogHeader>

        {!counterpart && suggestions === null && (
          <p className="text-sm text-muted-foreground" role="status">
            {t('loading')}
          </p>
        )}
        {!counterpart && !failed && suggestions?.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('none-found')}</p>
        )}
        {!counterpart && suggestions && suggestions.length > 0 && (
          <ul className="flex flex-col gap-2" aria-label={t('title')}>
            {suggestions.map((suggestion) => {
              const differs =
                file?.piiPolicy &&
                piiInconsistency(file.piiPolicy, suggestion.piiPolicy);
              return (
                <li
                  key={suggestion.id}
                  className="rounded-md border border-border p-2 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 break-words">
                      {suggestion.fileName}{' '}
                      <span
                        className="rounded border border-border px-1 text-[10px] uppercase"
                        aria-label={language(suggestion.language)}
                      >
                        {suggestion.language
                          ? shortLanguageTag(suggestion.language)
                          : '—'}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        file &&
                        run(
                          () =>
                            createDocumentPairAction(file.id, suggestion.id),
                          t('paired-toast'),
                        )
                      }
                    >
                      {t('pair-action')}
                    </Button>
                  </div>
                  {differs && (
                    <p className="mt-1 text-muted-foreground">
                      {t('pii-differs')}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {failed && (
          <p className="text-sm text-destructive" role="alert">
            {t('error')}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('close')}
          </Button>
          {counterpart && file && (
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                run(() => removeDocumentPairAction(file.id), t('removed-toast'))
              }
            >
              {t('remove-action')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
