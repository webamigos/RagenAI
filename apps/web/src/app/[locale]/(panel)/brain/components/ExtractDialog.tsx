'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  MAX_DOCUMENTS_PER_RUN,
  type ExtractableDocument,
} from '@/features/brain/contracts/brain-extraction.types';

import { startBrainExtractionAction } from '../actions';

/**
 * Choose documents and start an extraction run (spec D3). Documents no page
 * cites yet are preselected — the usual intent is "what Brain has not read"
 * — and each row says how many pages already cite it, so re-extracting is a
 * visible choice rather than an accident. The run happens in the background;
 * candidates appear as each document finishes.
 */
export function ExtractDialog({
  documents,
}: {
  documents: ExtractableDocument[];
}) {
  const t = useTranslations('brain.extract');
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const unread = () =>
    new Set(
      documents
        .filter((d) => d.pages === 0)
        .slice(0, MAX_DOCUMENTS_PER_RUN)
        .map((d) => d.fileId),
    );
  const [selected, setSelected] = useState<Set<string>>(unread);

  const toggle = (id: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });

  const start = () =>
    startTransition(async () => {
      const result = await startBrainExtractionAction({
        fileIds: [...selected],
      });
      if (result.success) {
        toast.success(t('started', { count: result.documents }));
        setOpen(false);
        return;
      }
      toast.error(t(`errors.${result.error}`));
    });

  return (
    <>
      <Button
        size="sm"
        onClick={() => {
          setSelected(unread());
          setOpen(true);
        }}
      >
        {t('open')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('none')}</p>
          ) : (
            <ul className="max-h-80 space-y-1.5 overflow-y-auto">
              {documents.map((d) => (
                <li key={d.fileId} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    id={`brain-extract-${d.fileId}`}
                    checked={selected.has(d.fileId)}
                    onCheckedChange={(v) => toggle(d.fileId, v === true)}
                  />
                  <label
                    htmlFor={`brain-extract-${d.fileId}`}
                    className="min-w-0 flex-1 cursor-pointer truncate"
                  >
                    {d.fileName}
                  </label>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {d.pages === 0
                      ? t('not-extracted')
                      : t('pages', { count: d.pages })}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {selected.size > MAX_DOCUMENTS_PER_RUN && (
            <p className="text-xs text-destructive">
              {t('too-many', { max: MAX_DOCUMENTS_PER_RUN })}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              disabled={
                pending ||
                selected.size === 0 ||
                selected.size > MAX_DOCUMENTS_PER_RUN
              }
              onClick={start}
            >
              {t('start', { count: selected.size })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
