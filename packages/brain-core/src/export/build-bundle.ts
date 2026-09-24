import {
  BUNDLE_FORMAT_VERSION,
  bundleManifestSchema,
  EXPORTABLE_PAGE_STATUSES,
  knowledgeGraphSchema,
  pageFrontmatterSchema,
  type BundleManifest,
  type KnowledgeEdgeOrigin,
  type KnowledgePageStatus,
  type KnowledgePageType,
} from '@ragenai/brain-contracts';
import { stringify } from 'yaml';

import { assembleGraph } from '../graph/assemble-graph';

export type BundlePageInput = {
  id: string;
  slug: string;
  title: string;
  type: KnowledgePageType;
  status: KnowledgePageStatus;
  content: string;
  contentHash: string;
  /** The owner as the bundle names them — an email, a person's handle. */
  owner: string | null;
  accessibleBy: string[];
  validFrom: string | null;
  supersededBy: string | null;
  verifyEvery: string | null;
  lastVerifiedAt: string | null;
  lastVerifiedBy: string | null;
  sources: {
    fileId: string;
    documentVersionId: string;
    span: string;
    quote: string;
    hash: string;
    sourceDeletedAt: string | null;
  }[];
};

export type BundleEdgeInput = {
  from: string;
  to: string;
  kind: string;
  origin: KnowledgeEdgeOrigin;
  confidence: number | null;
};

/** Why a page was left out of a bundle. */
export type BundleSkipReason =
  'not-approved' | 'no-owner' | 'no-access' | 'no-sources' | 'invalid';

export type Bundle = {
  /** Path inside the bundle → file content. */
  files: Map<string, string>;
  manifest: BundleManifest;
  skipped: { id: string; title: string; reason: BundleSkipReason }[];
};

export const GRAPH_PATH = 'graph.json';
export const MANIFEST_PATH = 'manifest.json';

/**
 * The organization's curated knowledge as files a customer can read without
 * us (spec E1): one markdown file per page with its frontmatter, `graph.json`
 * over exactly those pages, and `manifest.json` listing them with hashes.
 *
 * **Only pages someone vouches for leave**: approved or stale (a stale page is
 * approved knowledge whose check lapsed — hiding it would hide the finding),
 * with an owner, with at least one principal and at least one source. Each
 * page left out is returned with its reason, so the panel can say "12 pages
 * not exported: 9 need an owner" instead of a bundle quietly shorter than the
 * list.
 *
 * **Access is copied, never computed** (spec: "The permission rule, stated
 * once"): a page's `accessibleBy` goes into its frontmatter as stored, and a
 * page whose list is empty is not exported rather than exported to everyone.
 * `brain-export-never-widens-access.test.ts` holds this.
 *
 * Every file is checked against the Phase A contracts before it is written,
 * so a bundle this produces is one `bundleManifestSchema` and
 * `pageFrontmatterSchema` accept — the same check an importer runs.
 */
export function buildBundle(input: {
  organizationId: string;
  generatedAt: Date;
  pages: ReadonlyArray<BundlePageInput>;
  edges: ReadonlyArray<BundleEdgeInput>;
}): Bundle {
  const files = new Map<string, string>();
  const skipped: Bundle['skipped'] = [];
  const exported: BundlePageInput[] = [];
  const entries: BundleManifest['pages'] = [];
  const takenPaths = new Set<string>([GRAPH_PATH, MANIFEST_PATH]);

  for (const page of [...input.pages].sort((a, b) =>
    a.slug.localeCompare(b.slug),
  )) {
    const reason = skipReason(page);
    if (reason) {
      skipped.push({ id: page.id, title: page.title, reason });
      continue;
    }
    const frontmatter = pageFrontmatterSchema.safeParse({
      id: page.id,
      slug: page.slug,
      title: page.title,
      type: page.type,
      status: page.status,
      owner: page.owner,
      accessibleBy: page.accessibleBy,
      validFrom: page.validFrom,
      supersededBy: page.supersededBy,
      verifyEvery: page.verifyEvery,
      lastVerifiedAt: page.lastVerifiedAt,
      lastVerifiedBy: page.lastVerifiedBy,
      contentHash: page.contentHash,
      sources: page.sources,
    });
    if (!frontmatter.success) {
      skipped.push({ id: page.id, title: page.title, reason: 'invalid' });
      continue;
    }
    let path = `pages/${page.slug}.md`;
    for (let n = 2; takenPaths.has(path); n++) {
      path = `pages/${page.slug}-${n}.md`;
    }
    takenPaths.add(path);
    files.set(
      path,
      `---\n${stringify(frontmatter.data)}---\n\n${page.content.trimEnd()}\n`,
    );
    entries.push({ id: page.id, path, contentHash: page.contentHash });
    exported.push(page);
  }

  // The graph names only exported pages: an edge to a page the reader was
  // not given would point at nothing (graph.json's own contract).
  const { graph } = assembleGraph(
    exported.map((p) => ({
      id: p.id,
      title: p.title,
      type: p.type,
      status: p.status,
    })),
    input.edges,
  );
  files.set(
    GRAPH_PATH,
    `${JSON.stringify(knowledgeGraphSchema.parse(graph), null, 2)}\n`,
  );

  const manifest = bundleManifestSchema.parse({
    formatVersion: BUNDLE_FORMAT_VERSION,
    organizationId: input.organizationId,
    generatedAt: input.generatedAt.toISOString(),
    chunking: 'predefined',
    graph: GRAPH_PATH,
    pages: entries,
  });
  files.set(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

  return { files, manifest, skipped };
}

function skipReason(page: BundlePageInput): BundleSkipReason | null {
  if (!(EXPORTABLE_PAGE_STATUSES as readonly string[]).includes(page.status)) {
    return 'not-approved';
  }
  if (!page.owner) {
    return 'no-owner';
  }
  if (page.accessibleBy.length === 0) {
    return 'no-access';
  }
  if (page.sources.length === 0) {
    return 'no-sources';
  }
  return null;
}
