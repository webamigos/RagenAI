import { describe, expect, it } from 'vitest';

import {
  checkDefaultProfile,
  ProfileMismatchError,
  traceProfileMismatches,
} from '../lib/profile';

const clean = { env: {}, org: null };

describe('checkDefaultProfile', () => {
  it('accepts a fresh install: nothing set anywhere', () => {
    expect(checkDefaultProfile(clean)).toEqual([]);
  });

  it('accepts columns and overrides that restate the defaults', () => {
    expect(
      checkDefaultProfile({
        env: { FEATURE_FLAG_DOC_SUMMARIES: '1' },
        org: {
          multiQueryEnabled: true,
          docSummariesEnabled: null,
          featureOverrides: { contextExpansion: true, sectionSelection: null },
        },
      }),
    ).toEqual([]);
  });

  it('refuses reranking switched on, and summaries switched off, in the env', () => {
    const problems = checkDefaultProfile({
      env: { FEATURE_FLAG_RERANKING: '1', FEATURE_FLAG_DOC_SUMMARIES: 'false' },
      org: null,
    });
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/FEATURE_FLAG_RERANKING=1/);
    expect(problems[1]).toMatch(/FEATURE_FLAG_DOC_SUMMARIES=false/);
  });

  it('refuses an organization that turned multi-query or summaries off', () => {
    expect(
      checkDefaultProfile({
        env: {},
        org: { multiQueryEnabled: false, docSummariesEnabled: false },
      }),
    ).toHaveLength(2);
  });

  it('names a retrieval feature key that differs, and where it came from', () => {
    const problems = checkDefaultProfile({
      env: {},
      org: { featureOverrides: { sectionSelection: true } },
      platformDefaults: { contextualChunks: false },
    });
    expect(problems).toEqual([
      'contextualChunks is false (platform-default); the default is true',
      'sectionSelection is true (org-override); the default is false',
    ]);
  });
});

describe('traceProfileMismatches', () => {
  it('accepts the default turn', () => {
    expect(
      traceProfileMismatches({
        expansionEnabled: true,
        rerankEnabled: false,
        selectionEnabled: false,
        crossQueryFusionEnabled: false,
      }),
    ).toEqual([]);
  });

  it('names each stage the server ran differently', () => {
    expect(
      traceProfileMismatches({ rerankEnabled: true, expansionEnabled: false }),
    ).toEqual([
      'the server ran with expansionEnabled=false; the default is true',
      'the server ran with rerankEnabled=true; the default is false',
    ]);
  });

  it('does not count a flag an older app does not send', () => {
    expect(traceProfileMismatches({})).toEqual([]);
  });
});

// The runner's per-case catch rethrows this type and records everything else
// as a failed case; an instanceof check is what tells them apart.
describe('ProfileMismatchError', () => {
  it('is an Error the runner can tell apart from a failed case', () => {
    const err = new ProfileMismatchError('--profile default: q1: rerank');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ProfileMismatchError);
    expect(err.name).toBe('ProfileMismatchError');
    expect(new Error('fetch failed')).not.toBeInstanceOf(ProfileMismatchError);
  });
});
