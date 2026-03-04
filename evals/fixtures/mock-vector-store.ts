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
    this.documents = documents ?? (productFaq as VectorStoreDocument[]);
  }

  async similaritySearch(
    query: string,
    k: number,
    _filter?: object,
  ): Promise<VectorStoreDocument[]> {
    const queryTerms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2);

    const scored = this.documents.map((doc) => {
      const content = doc.pageContent.toLowerCase();
      let score = 0;
      for (const term of queryTerms) {
        if (content.includes(term)) {
          score += 1;
        }
      }
      return { doc, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k).map((s) => s.doc);
  }

  async addDocuments(documents: VectorStoreDocument[]): Promise<void> {
    this.documents.push(...documents);
  }
}
