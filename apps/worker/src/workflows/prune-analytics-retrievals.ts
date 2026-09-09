import { log, proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities';

export type PruneAnalyticsRetrievalsResult = {
  organizationsScanned: number;
  retrievalsDeleted: number;
  olderThan: string;
};

/**
 * Nightly prune of `document_retrievals` past the retention window.
 *
 * `document_retrievals` records every file the model was shown, not only the
 * ones the answer cited, so it accrues several rows per answer where
 * `document_citations` accrues one or none. Nothing on the dashboard reads
 * further back than 90 days, so rows beyond `ANALYTICS_RETENTION_DAYS` are
 * cost without a reader.
 *
 * The Temporal Schedule that drives it is **not** created here — see
 * `src/scripts/ensure-analytics-retention-schedule.ts`, and the sibling
 * warning on the demo cleanup: a schedule is server-side state that outlives
 * the code defining it, so deleting this workflow leaves a schedule firing at
 * a workflow that no longer exists.
 *
 * ## What a failed run costs
 *
 * The same answer the demo cleanup gives, and for the same reason: the worker
 * has no alerting, so a failure surfaces as a failed run in the Temporal UI
 * and a line in the OTel logs, and nothing pages anyone.
 *
 * That is acceptable here because the work does not compound in the dangerous
 * direction. A missed run leaves rows that should have gone, and the next
 * night's run deletes them too — the cutoff is computed from the clock, not
 * from a cursor, so nothing is skipped by having been missed. The failure mode
 * is a table that is briefly larger than intended, not lost data and not a
 * wrong number on the screen: every panel filters by its own window anyway.
 */
export async function pruneAnalyticsRetrievals(): Promise<PruneAnalyticsRetrievalsResult> {
  const { pruneDocumentRetrievals } = proxyActivities<typeof activities>({
    retry: {
      initialInterval: '30 seconds',
      maximumInterval: '5 minutes',
      backoffCoefficient: 2,
      // A nightly job has no reason to retry for hours: the next run is the
      // better recovery, and a run still retrying when the next one starts is
      // how two deletes end up interleaved.
      maximumAttempts: 3,
    },
    // Longer than the demo cleanup's 10 minutes: this walks every
    // organization, and the first run after deployment on an installation
    // that has been collecting for a while has the most to delete.
    startToCloseTimeout: '30 minutes',
  });

  const result = await pruneDocumentRetrievals();

  log.info('Analytics retrieval prune finished', {
    organizationsScanned: result.organizationsScanned,
    retrievalsDeleted: result.retrievalsDeleted,
    olderThan: result.olderThan,
  });

  return result;
}
