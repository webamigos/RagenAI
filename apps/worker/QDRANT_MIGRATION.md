# Qdrant Migration Guide for ragen-worker

## Overview

This documents the changes needed to switch ragen-worker from Meilisearch to Qdrant as the default vector store, matching the changes already made in apps/web.

## 1. Install Dependencies

```bash
npm install @qdrant/js-client-rest
# meilisearch package can stay for backwards compatibility
```

## 2. Create Qdrant Service (`src/services/qdrant.ts`)

Replace/complement `src/services/meilisearch.ts` with a new Qdrant service.

**Key differences from meilisearch.ts:**

| Aspect | Meilisearch (current) | Qdrant (new) |
|--------|----------------------|--------------|
| Client | `new MeiliSearch({ host, apiKey })` | `new QdrantClient({ url, apiKey })` |
| Index/Collection | `client.index(sanitizeIndexName(orgId))` | `client.getCollection(orgId)` or create it |
| Document ID | `id: uuidv4()` | `id: uuidv4()` (same) |
| Vector field | `_vectors: { custom: embedding[] }` | `vector: embedding[]` (top-level) |
| Payload | `{ content, metadata, _vectors }` | `{ content, pageContent, metadata }` |
| Setup | `ensureIndex()` with embedder config | `ensureCollection()` with vector config |

**New service structure:**

```typescript
// src/services/qdrant.ts
import { QdrantClient } from '@qdrant/js-client-rest';
import { embedMany } from 'ai';
import { v4 as uuidv4 } from 'uuid';
import { getEmbeddingModel } from './llm/provider';
import { EMBEDDINGS_MODEL } from '../consts';
import { logger } from './logger';

const VECTOR_SIZE = 1024; // Cohere embed-multilingual-v3
const BATCH_SIZE = 100;
const verifiedCollections = new Set<string>();

let client: QdrantClient | null = null;

function getClient(): QdrantClient {
  if (!client) {
    client = new QdrantClient({
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      apiKey: process.env.QDRANT_API_KEY,
    });
  }
  return client;
}

async function ensureCollection(collectionName: string): Promise<void> {
  if (verifiedCollections.has(collectionName)) return;

  const qdrant = getClient();
  const exists = await qdrant.collectionExists(collectionName);

  if (!exists.exists) {
    await qdrant.createCollection(collectionName, {
      vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
      optimizers_config: { indexing_threshold: 20000 },
    });

    // Create payload indexes for filterable metadata fields
    const indexFields = [
      'metadata.project_id',
      'metadata.project_public_id',
      'metadata.file_id',
      'metadata.organization_id',
      'metadata.accessible_by',
    ];
    for (const field of indexFields) {
      await qdrant.createPayloadIndex(collectionName, {
        field_name: field,
        field_schema: 'keyword',
      });
    }
  }

  verifiedCollections.add(collectionName);
}

async function addDocuments({
  orgId,
  docs,
}: {
  orgId: string;
  docs: Array<{ pageContent: string; metadata: Record<string, unknown> }>;
}): Promise<{ inputTokens: number }> {
  const qdrant = getClient();
  await ensureCollection(orgId);

  const texts = docs.map((d) => d.pageContent);
  const model = getEmbeddingModel(EMBEDDINGS_MODEL);

  const { embeddings, usage } = await embedMany({ model, values: texts });

  const points = docs.map((doc, i) => ({
    id: uuidv4(),
    vector: embeddings[i],
    payload: {
      content: doc.pageContent,
      pageContent: doc.pageContent,
      metadata: doc.metadata,
    },
  }));

  // Batch upserts
  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE);
    await qdrant.upsert(orgId, { points: batch, wait: true });
  }

  logger.info({ count: docs.length, collection: orgId }, 'Documents added to Qdrant');

  return { inputTokens: usage?.tokens ?? 0 };
}

export const qdrantService = { addDocuments };
```

**Note:** No `sanitizeIndexName()` needed — Qdrant collection names accept UUIDs directly. The orgId from apps/web is a UUID (e.g., `cm4abc123...`), which is valid as a Qdrant collection name.

## 3. Update Activity (`src/activities/meilisearch/add-documents-to-vector-store.ts`)

Two options:

**Option A: Rename + replace** (cleaner)
- Create `src/activities/vector-store/add-documents-to-vector-store.ts`
- Import `qdrantService` instead of `meilisearch`
- Update workflow imports

**Option B: Modify in place** (simpler, no workflow name changes)
- Keep the file in `src/activities/meilisearch/` 
- Add a switch on org's `vectorStore` setting (query from DB)
- Default to Qdrant

Recommended: **Option A** for clarity, but keep the Temporal activity name the same (`addDocumentsToVectorStore`) to avoid workflow compatibility issues.

```typescript
// src/activities/vector-store/add-documents-to-vector-store.ts
import { qdrantService } from '../../services/qdrant';
import { meilisearch } from '../../services/meilisearch'; // keep for legacy
import { getOrgVectorStore } from '../db/get-org-metadata'; // new query
import { logger } from '../../services/logger';
import type { Document } from '../../types/Document';

export const addDocumentsToVectorStore = async ({
  orgId,
  docs,
}: {
  orgId: string;
  docs: Document[];
}) => {
  try {
    const vectorStoreType = await getOrgVectorStore(orgId);

    if (vectorStoreType === 'meilisearch') {
      return await meilisearch.addDocuments({ orgId, docs });
    }

    // Default: Qdrant
    return await qdrantService.addDocuments({ orgId, docs });
  } catch (error) {
    logger.error({ err: error }, 'Failed to add documents to vector store');
    throw error;
  }
};
```

## 4. Add DB Query for Vector Store Type

Create a new DB activity or utility to fetch the org's vector store setting:

```typescript
// src/activities/db/get-org-metadata.ts (or add to existing db activities)
import { db } from '../../services/db';

export async function getOrgVectorStore(orgId: string): Promise<string | null> {
  const result = await db('Organization')  // Knex query
    .select('vector_store')
    .where('id', orgId)
    .first();
  return result?.vector_store ?? null;
}
```

**Important:** The `Organization` table column is `vector_store` (snake_case in DB, maps to `vectorStore` in Prisma). Knex queries use the actual DB column name.

## 5. Update Environment Variables (`src/validateEnvVars.ts`)

```typescript
// Add:
QDRANT_URL: z.string().url().optional(),  // defaults to http://localhost:6333
QDRANT_API_KEY: z.string().optional(),

// Keep existing (for backwards compatibility):
MEILISEARCH_URL: z.string().url().optional(),
MEILISEARCH_API_KEY: z.string().optional(),

// In the superRefine section, require QDRANT_URL for staging/production:
if ((env.TARGET_ENV === 'staging' || env.TARGET_ENV === 'production') &&
    !env.QDRANT_URL) {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: 'QDRANT_URL is required for staging/production',
    path: ['QDRANT_URL'],
  });
}
```

## 6. Update CLAUDE.md

Replace Meilisearch references with Qdrant as default:
- `src/services/meilisearch.ts` → mention both `meilisearch.ts` and `qdrant.ts`
- `src/activities/meilisearch/` → `src/activities/vector-store/` (if renamed)
- Tech Stack: add `@qdrant/js-client-rest` for vector storage
- Environment: add `QDRANT_URL`, `QDRANT_API_KEY`

## 7. Workflows (No Changes Needed)

The workflows (`parse-and-embed.ts`, `scrape-website.ts`) call `addDocumentsToVectorStore` by activity name. As long as the activity name stays the same, no workflow changes are needed. This is important for Temporal compatibility — existing running workflows won't break.

## 8. Railway Deployment

Add env vars to the ragen-worker Railway service:
```
QDRANT_URL=http://<qdrant-railway-service>:6333
QDRANT_API_KEY=<your-api-key>
```

The Qdrant service should be on the same Railway private network as ragen-worker for internal communication.

## Files Changed Summary

| File | Action | Notes |
|------|--------|-------|
| `package.json` | **Modified** | Added `@qdrant/js-client-rest`; kept `meilisearch` for legacy |
| `src/services/qdrant.ts` | **New file** | Qdrant client with `ensureCollection` and `addDocuments` |
| `src/activities/meilisearch/add-documents-to-vector-store.ts` | **Modified** | Switched to Qdrant unconditionally (no org-level routing) |
| `src/validateEnvVars.ts` | **Modified** | Added `QDRANT_URL`, `QDRANT_API_KEY` |
| `CLAUDE.md` | **Modified** | Updated references to reflect Qdrant as default |
| `README.md` | **Modified** | Updated references to reflect Qdrant as default |
| `.env.example` | **Modified** | Added Qdrant env vars section |

## Payload Format (Must Match apps/web)

The Qdrant document payload format must match what apps/web expects when querying:

```typescript
{
  id: string,           // UUID
  vector: number[],     // 1024-dim Cohere embedding
  payload: {
    content: string,    // document text (primary)
    pageContent: string, // document text (alias for compat)
    metadata: {
      file_name: string,
      file_id: string,
      organization_id: string,
      project_id: number | null,
      project_public_id: string | null,
      accessible_by: string[],  // ["org:xxx", "user:yyy", "team:zzz"]
      // ... other metadata fields
    }
  }
}
```

## Migration of Existing Data

Existing Meilisearch data does NOT auto-migrate to Qdrant. Options:
1. **Re-embed**: Trigger re-embedding for all existing files via Temporal workflows (cleanest, updates embeddings too)
2. **Migrate script**: Read from Meilisearch, write to Qdrant (preserves existing embeddings but requires custom script)
3. **Gradual**: New orgs use Qdrant, existing orgs stay on Meilisearch until manually switched

Recommended: Option 3 for zero-downtime, then Option 1 for existing orgs.
