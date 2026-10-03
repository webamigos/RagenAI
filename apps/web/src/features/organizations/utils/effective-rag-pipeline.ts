import type { RagPipelineSettings } from '../contracts/organization.types';

/**
 * What each row of the RAG settings page shows: whether the stage runs at
 * query or ingest time, not only what the organization's column says (spec
 * 2026-10-03-retrieval-claims, A2). A switch that reads "on" for a stage
 * nothing runs is the claim the spec exists to remove.
 */

export type PipelineRowNote =
  | { key: 'doc-summaries-installation-off-note' }
  | { key: 'content-moderation-guardrails-note'; count: number }
  | { key: 'content-moderation-no-guardrails-note' }
  | { key: 'content-moderation-unreadable-note' }
  | { key: 'reranking-unavailable-note' }
  | { key: 'reranking-replaced-note' };

export type PipelineRow = { checked: boolean; note?: PipelineRowNote };

export type EffectivePipeline = {
  multiQuery: PipelineRow;
  docSummaries: PipelineRow;
  contentModeration: PipelineRow;
  reranking: PipelineRow;
  contextExpansion: PipelineRow;
  sectionSelection: PipelineRow;
};

export type EffectivePipelineInput = {
  ragSettings: RagPipelineSettings;
  /** What this installation can run at all, whatever an organization says. */
  installation: {
    /** `FEATURE_FLAG_DOC_SUMMARIES`, the installation-wide off switch. */
    docSummaries: boolean;
    /** `isRerankingEnabled()`: the env flag and a provider's credentials. */
    reranker: boolean;
  };
  retrievalFeatures: { contextExpansion: boolean; sectionSelection: boolean };
  /** The organization's resolved guardrail rules, input and output together. */
  guardrails: { active: number; degraded: boolean };
};

export function resolveEffectivePipeline({
  ragSettings,
  installation,
  retrievalFeatures,
  guardrails,
}: EffectivePipelineInput): EffectivePipeline {
  return {
    // Read by the chain as-is; a turn that retrieves nothing skips it, which
    // is a property of that turn rather than of the organization.
    multiQuery: { checked: ragSettings.multiQueryEnabled },
    docSummaries: docSummariesRow(ragSettings, installation),
    contentModeration: contentModerationRow(guardrails),
    reranking: rerankingRow(ragSettings, installation, retrievalFeatures),
    contextExpansion: { checked: retrievalFeatures.contextExpansion },
    sectionSelection: { checked: retrievalFeatures.sectionSelection },
  };
}

function docSummariesRow(
  ragSettings: RagPipelineSettings,
  installation: EffectivePipelineInput['installation'],
): PipelineRow {
  if (ragSettings.docSummariesEnabled && !installation.docSummaries) {
    return {
      checked: false,
      note: { key: 'doc-summaries-installation-off-note' },
    };
  }
  return { checked: ragSettings.docSummariesEnabled };
}

/**
 * `contentModerationEnabled` is not read by anything: guardrails replaced the
 * moderation call, and what runs is the organization's resolved rule set,
 * empty being off. So the row reports the rules, not the column.
 */
function contentModerationRow(
  guardrails: EffectivePipelineInput['guardrails'],
): PipelineRow {
  if (guardrails.degraded) {
    return {
      checked: false,
      note: { key: 'content-moderation-unreadable-note' },
    };
  }
  if (guardrails.active > 0) {
    return {
      checked: true,
      note: {
        key: 'content-moderation-guardrails-note',
        count: guardrails.active,
      },
    };
  }
  return {
    checked: false,
    note: { key: 'content-moderation-no-guardrails-note' },
  };
}

function rerankingRow(
  ragSettings: RagPipelineSettings,
  installation: EffectivePipelineInput['installation'],
  retrievalFeatures: EffectivePipelineInput['retrievalFeatures'],
): PipelineRow {
  if (!ragSettings.rerankingEnabled) {
    return { checked: false };
  }
  if (!installation.reranker) {
    return { checked: false, note: { key: 'reranking-unavailable-note' } };
  }
  // Section selection takes the reranker's slot: with both on, the reranker
  // does not run.
  if (retrievalFeatures.sectionSelection) {
    return { checked: false, note: { key: 'reranking-replaced-note' } };
  }
  return { checked: true };
}

/**
 * `FEATURE_FLAG_DOC_SUMMARIES` as the worker reads it: on unless "0" or
 * "false". Read here from the web process's own environment — the same
 * value wherever one env file serves every app (compose, `create-ragen-app`);
 * a deployment that sets it on the worker alone must set it on web too for
 * this row to say so.
 */
export function docSummariesInstalled(
  value: string | undefined = process.env.FEATURE_FLAG_DOC_SUMMARIES,
): boolean {
  if (value === undefined) {
    return true;
  }
  return value !== '0' && value.toLowerCase() !== 'false';
}
