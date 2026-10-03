import {
  DEFAULT_FEATURES,
  resolveFeatures,
  type FeatureKey,
} from '@ragenai/platform-contracts';

/**
 * `--profile default` (spec 2026-10-03-retrieval-claims, D1): a run that is
 * labelled "the default install" has to be one. A number someone quotes is
 * only worth quoting if the flags behind it are the ones a fresh install
 * ships with, so the run refuses to start — and stops on the first case —
 * when anything differs, naming what.
 */

/** The retrieval stages behind feature keys, checked against their defaults. */
// `crossQueryFusion` only where the key exists, so the check holds on a
// checkout that predates it.
export const PROFILE_FEATURE_KEYS: readonly FeatureKey[] = [
  'contextualChunks',
  'contextExpansion',
  'sectionSelection',
  'crossQueryFusion',
].filter((key): key is FeatureKey => key in DEFAULT_FEATURES);

export interface ProfileInputs {
  /** The runner's environment, which `.env.local` also feeds the app from. */
  env: Readonly<Record<string, string | undefined>>;
  /** The organization's pipeline settings; `null` columns mean the default. */
  org: {
    multiQueryEnabled?: boolean | null;
    docSummariesEnabled?: boolean | null;
    featureOverrides?: unknown;
  } | null;
  /** The platform-wide feature defaults row, as stored. */
  platformDefaults?: unknown;
}

/** What is not the default install, in words; empty when it is. */
export function checkDefaultProfile({
  env,
  org,
  platformDefaults,
}: ProfileInputs): string[] {
  const problems: string[] = [];
  if (env.FEATURE_FLAG_RERANKING === '1') {
    problems.push(
      'FEATURE_FLAG_RERANKING=1 — a default install does not rerank',
    );
  }
  const summaries = env.FEATURE_FLAG_DOC_SUMMARIES;
  if (summaries === '0' || summaries?.toLowerCase() === 'false') {
    problems.push(
      `FEATURE_FLAG_DOC_SUMMARIES=${summaries} — a default install writes summaries`,
    );
  }
  if (org?.multiQueryEnabled === false) {
    problems.push('the organization has multi-query off; the default is on');
  }
  if (org?.docSummariesEnabled === false) {
    problems.push(
      'the organization has document summaries off; the default is on',
    );
  }
  const resolved = resolveFeatures({
    orgOverrides: org?.featureOverrides as Record<string, unknown> | undefined,
    platformDefaults: platformDefaults as Record<string, unknown> | undefined,
  });
  for (const key of PROFILE_FEATURE_KEYS) {
    const { value, source } = resolved[key];
    if (value !== DEFAULT_FEATURES[key]) {
      problems.push(
        `${key} is ${value} (${source}); the default is ${DEFAULT_FEATURES[key]}`,
      );
    }
  }
  return problems;
}

/** The stage flags a retrieval trace reports for one turn. */
export interface TraceFlags {
  expansionEnabled?: boolean;
  rerankEnabled?: boolean;
  selectionEnabled?: boolean;
  crossQueryFusionEnabled?: boolean;
}

/**
 * The server's own account of the turn, which is what the runner's view of
 * the environment cannot give: the app may run with a different env file.
 * A flag the trace does not carry is not a mismatch — an older app sends
 * fewer — but one it carries must be the default.
 */
export function traceProfileMismatches(trace: TraceFlags): string[] {
  const expected: Required<TraceFlags> = {
    expansionEnabled: DEFAULT_FEATURES.contextExpansion,
    rerankEnabled: false,
    selectionEnabled: DEFAULT_FEATURES.sectionSelection,
    crossQueryFusionEnabled:
      'crossQueryFusion' in DEFAULT_FEATURES
        ? (DEFAULT_FEATURES as Record<string, boolean>).crossQueryFusion
        : false,
  };
  return (Object.keys(expected) as (keyof TraceFlags)[])
    .filter(
      (flag) => trace[flag] !== undefined && trace[flag] !== expected[flag],
    )
    .map(
      (flag) =>
        `the server ran with ${flag}=${trace[flag]}; the default is ${expected[flag]}`,
    );
}
