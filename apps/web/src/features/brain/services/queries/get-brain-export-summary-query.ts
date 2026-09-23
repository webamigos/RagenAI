import type { BundleSkipReason } from '@ragenai/brain-core';

import { getBrainBundleQuery } from './get-brain-bundle-query';

export type BrainExportSummary = {
  pages: number;
  skipped: Partial<Record<BundleSkipReason, number>>;
};

/**
 * What a download would contain, for the button beside it: how many pages
 * leave, and how many stay behind for which reason. Built by the same
 * function as the bundle, so the numbers cannot disagree with the file.
 */
export async function getBrainExportSummaryQuery(
  orgId: string,
): Promise<BrainExportSummary> {
  const bundle = await getBrainBundleQuery(orgId);
  const skipped: BrainExportSummary['skipped'] = {};
  for (const s of bundle.skipped) {
    skipped[s.reason] = (skipped[s.reason] ?? 0) + 1;
  }
  return { pages: bundle.manifest.pages.length, skipped };
}
