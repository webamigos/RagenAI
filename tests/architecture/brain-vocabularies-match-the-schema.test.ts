import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  EXPORTABLE_PAGE_STATUSES,
  KNOWLEDGE_DECISION_ACTIONS,
  KNOWLEDGE_EDGE_ORIGINS,
  KNOWLEDGE_FINDING_STATUSES,
  KNOWLEDGE_FINDING_TYPES,
  KNOWLEDGE_PAGE_STATUSES,
  KNOWLEDGE_PAGE_TYPES,
  PUBLICATION_ACTIONS,
} from '../../packages/brain-contracts/src/vocabulary';

/**
 * `packages/brain-contracts` spells out six schema enums as arrays, for the
 * reason `job-payload-enums-match-the-schema` gives for `packages/jobs`: a
 * package shared by several apps cannot import any one app's generated client.
 *
 * The cost of drift here is specific. A page type added to the schema and not
 * to the bundle vocabulary is a page that curation can approve and export
 * cannot write; the reverse is a bundle the importer accepts and Postgres
 * refuses. Both surface as a customer's export failing, long after the change
 * that caused it.
 */
const ROOT = join(import.meta.dirname, '..', '..');
const schema = readFileSync(join(ROOT, 'prisma', 'schema.prisma'), 'utf8');

const schemaEnum = (name: string): string[] => {
  const block = new RegExp(`enum ${name} \\{([^}]*)\\}`).exec(schema);
  expect(
    block,
    `enum ${name} is gone from prisma/schema.prisma`,
  ).not.toBeNull();
  return block![1]!
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter((line) => line.length > 0);
};

describe('the Brain vocabularies match the schema', () => {
  it.each([
    ['KnowledgePageType', KNOWLEDGE_PAGE_TYPES],
    ['KnowledgePageStatus', KNOWLEDGE_PAGE_STATUSES],
    ['KnowledgeEdgeOrigin', KNOWLEDGE_EDGE_ORIGINS],
    ['KnowledgeFindingType', KNOWLEDGE_FINDING_TYPES],
    ['KnowledgeFindingStatus', KNOWLEDGE_FINDING_STATUSES],
    ['KnowledgeDecisionAction', KNOWLEDGE_DECISION_ACTIONS],
  ] as const)('%s has the same members in both places', (name, declared) => {
    expect([...declared].sort()).toEqual(schemaEnum(name).sort());
  });

  // Typed as subsets already; this says the subsets are the ones the spec
  // means, so widening either is a visible change to this file.
  it('exports approved and stale pages, nothing else', () => {
    expect([...EXPORTABLE_PAGE_STATUSES].sort()).toEqual(['APPROVED', 'STALE']);
  });

  it('carries a generation on publish and unpublish, nothing else', () => {
    expect([...PUBLICATION_ACTIONS].sort()).toEqual(['PUBLISH', 'UNPUBLISH']);
  });
});
