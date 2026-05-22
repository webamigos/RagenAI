'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@ragenai/tui/button';
import { SparklesIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { LeadEnrichmentJobStatus } from '@/generated/prisma/enums';
import {
  bulkEnrichLeadList,
  getActiveEnrichmentJob,
} from '@/app/actions/leads';
import type { LeadEnrichmentJobDto } from '@/features/leads/services/queries/get-enrichment-job-query';

const POLL_INTERVAL_MS = 2500;

type Props = {
  leadListPublicId: string;
  initialJob: LeadEnrichmentJobDto | null;
};

function isActive(job: LeadEnrichmentJobDto | null): boolean {
  return (
    job !== null &&
    (job.status === LeadEnrichmentJobStatus.pending ||
      job.status === LeadEnrichmentJobStatus.running)
  );
}

export function BulkEnrichButton({ leadListPublicId, initialJob }: Props) {
  const t = useTranslations('leads-page');
  const router = useRouter();
  const [job, setJob] = useState<LeadEnrichmentJobDto | null>(initialJob);
  const [isPending, startTransition] = useTransition();

  const refresh =
    useCallback(async (): Promise<LeadEnrichmentJobDto | null> => {
      const latest = await getActiveEnrichmentJob({ leadListPublicId });
      setJob(latest);
      return latest;
    }, [leadListPublicId]);

  // Poll while a job is active. The effect re-binds only when active-ness
  // flips (not on every poll tick) by gating on a boolean key.
  const active = isActive(job);
  useEffect(() => {
    if (!active) {
      return;
    }
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const latest = await refresh();
        if (cancelled) {
          return;
        }
        if (!isActive(latest)) {
          router.refresh();
          return;
        }
      } catch {
        // Transient errors are tolerated; the next tick will retry.
      }
      if (!cancelled) {
        timeoutId = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };

    timeoutId = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [active, refresh, router]);

  const handleClick = () => {
    startTransition(async () => {
      try {
        const result = await bulkEnrichLeadList({ leadListPublicId });
        if (result.total === 0) {
          if (result.alreadyRunning && job && isActive(job)) {
            toast.info(t('enrich-all-already-running'));
          } else {
            toast.info(t('enrich-all-nothing-to-do'));
          }
          return;
        }
        toast.success(t('enrich-all-queued', { total: result.total }));
        await refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t('enrich-all-failed'),
        );
      }
    });
  };

  if (active && job) {
    return (
      <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
        <ArrowPathIcon className="size-4 animate-spin text-amber-600" />
        <span>
          {t('enrich-all-running', {
            processed: job.processed,
            total: job.total,
          })}
        </span>
      </div>
    );
  }

  return (
    <Button onClick={handleClick} disabled={isPending}>
      <SparklesIcon className="size-4" />
      <span className="whitespace-nowrap">{t('enrich-all')}</span>
    </Button>
  );
}
