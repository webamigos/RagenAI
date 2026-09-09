'use client';

import { DocumentTextIcon, XMarkIcon } from '@heroicons/react/20/solid';
import { useTranslations } from 'next-intl';
import type { MessageAttachment } from '@/features/messages/contracts/message.types';
import { getFileLabel } from '@ragenai/common-ui/utils/file-helpers';

type Props = {
  attachments: MessageAttachment[];
  onClose: () => void;
};

export const ThreadContentPanel = ({ attachments, onClose }: Props) => {
  const t = useTranslations('thread-content-panel');

  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="w-80 shrink-0 border-l border-border/40 bg-muted/20 overflow-y-auto">
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">{t('title')}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t('close')}
          >
            <XMarkIcon className="size-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {attachments.map((att, i) => {
            const cardContent = (
              <>
                <span
                  className="text-sm leading-snug line-clamp-3"
                  title={att.name}
                >
                  {att.name}
                </span>
                <span className="inline-flex items-center gap-1 self-start rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
                  <DocumentTextIcon className="size-3 text-primary" />
                  {getFileLabel(att.name)}
                </span>
              </>
            );

            const baseClass =
              'flex flex-col gap-2 w-full rounded-xl border border-border bg-background p-3';

            if (att.sourceUrl) {
              return (
                <a
                  key={`${att.name}-${i}`}
                  href={att.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${baseClass} hover:bg-muted/50 transition-colors no-underline text-foreground`}
                >
                  {cardContent}
                </a>
              );
            }

            return (
              <div key={`${att.name}-${i}`} className={baseClass}>
                {cardContent}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
