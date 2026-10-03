import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  docSummariesInstalled,
  resolveEffectivePipeline,
  type EffectivePipelineInput,
} from '../effective-rag-pipeline';

const base: EffectivePipelineInput = {
  ragSettings: {
    multiQueryEnabled: true,
    docSummariesEnabled: true,
    contentModerationEnabled: true,
    rerankingEnabled: true,
  },
  installation: { docSummaries: true, reranker: true },
  retrievalFeatures: { contextExpansion: true, sectionSelection: false },
  guardrails: { active: 2, degraded: false },
};

const resolve = (patch: Partial<EffectivePipelineInput> = {}) =>
  resolveEffectivePipeline({ ...base, ...patch });

describe('resolveEffectivePipeline', () => {
  it('shows every stage on, with the guardrail count, when everything runs', () => {
    const rows = resolve();
    expect(rows.multiQuery).toEqual({ checked: true });
    expect(rows.docSummaries).toEqual({ checked: true });
    expect(rows.reranking).toEqual({ checked: true });
    expect(rows.contentModeration).toEqual({
      checked: true,
      note: { key: 'content-moderation-guardrails-note', count: 2 },
    });
  });

  describe('reranking', () => {
    it('is off with a note when the org has it on and the installation has no reranker', () => {
      // The default install: FEATURE_FLAG_RERANKING unset, column true.
      expect(
        resolve({ installation: { docSummaries: true, reranker: false } })
          .reranking,
      ).toEqual({
        checked: false,
        note: { key: 'reranking-unavailable-note' },
      });
    });

    it('is off with the replaced note while section selection takes its slot', () => {
      expect(
        resolve({
          retrievalFeatures: { contextExpansion: true, sectionSelection: true },
        }).reranking,
      ).toEqual({ checked: false, note: { key: 'reranking-replaced-note' } });
    });

    it('is off without a note when the org has it off, whatever the installation', () => {
      for (const reranker of [true, false]) {
        expect(
          resolve({
            ragSettings: { ...base.ragSettings, rerankingEnabled: false },
            installation: { docSummaries: true, reranker },
          }).reranking,
        ).toEqual({ checked: false });
      }
    });
  });

  describe('document summaries', () => {
    it('is off with a note when the installation switched them off', () => {
      expect(
        resolve({ installation: { docSummaries: false, reranker: true } })
          .docSummaries,
      ).toEqual({
        checked: false,
        note: { key: 'doc-summaries-installation-off-note' },
      });
    });

    it('follows the org setting when the installation allows it', () => {
      expect(
        resolve({
          ragSettings: { ...base.ragSettings, docSummariesEnabled: false },
        }).docSummaries,
      ).toEqual({ checked: false });
    });
  });

  describe('content moderation', () => {
    it('reports the guardrail rules, not the column nothing reads', () => {
      const off = resolve({
        ragSettings: { ...base.ragSettings, contentModerationEnabled: false },
      });
      expect(off.contentModeration.checked).toBe(true);

      expect(
        resolve({ guardrails: { active: 0, degraded: false } })
          .contentModeration,
      ).toEqual({
        checked: false,
        note: { key: 'content-moderation-no-guardrails-note' },
      });
    });

    it('says so when the rules could not be read', () => {
      expect(
        resolve({ guardrails: { active: 0, degraded: true } })
          .contentModeration,
      ).toEqual({
        checked: false,
        note: { key: 'content-moderation-unreadable-note' },
      });
    });
  });

  it('passes the two feature-key stages through', () => {
    const rows = resolve({
      retrievalFeatures: { contextExpansion: false, sectionSelection: true },
    });
    expect(rows.contextExpansion).toEqual({ checked: false });
    expect(rows.sectionSelection).toEqual({ checked: true });
  });
});

describe('docSummariesInstalled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads FEATURE_FLAG_DOC_SUMMARIES the way the worker does', () => {
    // Unset in the process too, so the default parameter reads nothing a
    // developer's environment happens to carry.
    vi.stubEnv('FEATURE_FLAG_DOC_SUMMARIES', undefined);
    expect(docSummariesInstalled()).toBe(true);
    expect(docSummariesInstalled(undefined)).toBe(true);
    expect(docSummariesInstalled('1')).toBe(true);
    expect(docSummariesInstalled('0')).toBe(false);
    expect(docSummariesInstalled('false')).toBe(false);
    expect(docSummariesInstalled('FALSE')).toBe(false);
  });
});
