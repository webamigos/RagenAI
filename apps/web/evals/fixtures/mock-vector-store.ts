import type {
  VectorStoreClient,
  VectorStoreDocument,
} from '@/libs/vector-store/types';
import productFaq from './documents/product-faq.json' with { type: 'json' };

/**
 * In-memory VectorStoreClient that uses keyword scoring for similarity search.
 * Used in promptfoo evals to avoid requiring Meilisearch.
 */
export class MockVectorStoreClient implements VectorStoreClient {
  private documents: VectorStoreDocument[];

  constructor(documents?: VectorStoreDocument[]) {
    this.documents = structuredClone(
      documents ?? (productFaq as VectorStoreDocument[]),
    );
  }

  async similaritySearch(
    query: string,
    k: number,
    _filter?: object,
  ): Promise<VectorStoreDocument[]> {
    const queryTerms = tokenize(query).filter(
      (t) => t.length > 2 && !STOPWORDS.has(t),
    );

    const scored = this.documents
      .map((doc) => {
        const docTerms = new Set(tokenize(doc.pageContent));
        let score = 0;
        for (const term of queryTerms) {
          if (docTerms.has(term)) {
            score += 1;
          }
        }
        return { doc, score };
      })
      .filter((s) => s.score > 0);

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k).map((s) => s.doc);
  }

  async addDocuments(documents: VectorStoreDocument[]): Promise<void> {
    this.documents.push(...structuredClone(documents));
  }
}

/**
 * Split on non-word characters so terms match whole words.
 *
 * The previous implementation used `content.includes(term)`, which made "work"
 * match inside "workflow" — enough to pull an unrelated document to the top and
 * fail an assertion for reasons that have nothing to do with the model.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * Question words carry no topical signal but scored the same as real terms,
 * so every document containing "how" or "does" tied with the relevant one.
 */
const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'are',
  'you',
  'how',
  'does',
  'what',
  'can',
  'with',
  'this',
  'that',
  'from',
  'use',
  'used',
  'using',
  'have',
  'has',
  'was',
  'were',
  'its',
  'about',
  'into',
  'they',
  'them',
  'there',
  'their',
]);
