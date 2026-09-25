import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { getBrainLanguagesQuery } from '@/features/brain/services/queries/brain-language-scope';
import { getBrainAccessQuery } from '@/features/brain/services/queries/get-brain-access-query';
import { getExtractableDocumentsQuery } from '@/features/brain/services/queries/get-extractable-documents-query';

import { BrainTabs } from './components/BrainTabs';
import { ExtractDialog } from './components/ExtractDialog';
import { LanguageFilter } from './components/LanguageFilter';
import { BrainScreenProvider } from './components/assistant/BrainAssistantContext';
import {
  BrainAssistantShell,
  BrainAssistantToggle,
} from './components/assistant/BrainAssistantShell';

export const dynamic = 'force-dynamic';

/**
 * Ragen Brain's panel (spec D1). Owners and admins of an organization with
 * the `brain` flag on; anyone else gets a 404, so a member cannot tell a
 * disabled feature from a missing one. Each page asks again — a layout does
 * not guard the route segments beneath it on its own.
 */
export default async function BrainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getBrainAccessQuery();
  if (!access) {
    notFound();
  }
  const [t, documents, languages] = await Promise.all([
    getTranslations('brain'),
    access.canWrite
      ? getExtractableDocumentsQuery(access.orgId)
      : Promise.resolve([]),
    getBrainLanguagesQuery(access.orgId),
  ]);

  return (
    <BrainScreenProvider>
      {/*
        The operator's assistant sits beside every Brain view when the
        `brainAssistant` key is on (spec 2026-09-25-brain-operator-assistant),
        and the content keeps its full width when it is off.
      */}
      <BrainAssistantShell
        enabled={access.assistant}
        canWrite={access.canWrite}
      >
        {/*
          The full width of the panel. Capped at 1120px it left half of a wide
          screen empty beside a graph that needed the room. No padding of its
          own: the panel shell already has it, and adding more set Brain's
          title lower than every other screen's.
        */}
        <div className="w-full">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-display text-xl font-semibold text-foreground">
              {t('title')}
            </h1>
            <div className="flex items-center gap-2">
              <BrainAssistantToggle />
              {access.canWrite && <ExtractDialog documents={documents} />}
            </div>
          </div>
          {/*
            Read-only mode says so once, at the top, rather than leaving a
            reader to wonder where the buttons went. Every page below hides its
            controls on `canWrite`, and every action refuses on its own check.
          */}
          {!access.canWrite && (
            <p
              role="status"
              data-testid="brain-read-only"
              className="mt-3 rounded-[6px] border border-border bg-muted px-3 py-2 text-xs text-muted-foreground"
            >
              {t('read-only.notice')}
            </p>
          )}
          <BrainTabs aside={<LanguageFilter languages={languages} />} />
          {children}
        </div>
      </BrainAssistantShell>
    </BrainScreenProvider>
  );
}
