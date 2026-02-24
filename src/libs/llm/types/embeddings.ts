export type BaseEmbeddingsConfig = {
  model?: string;
};

export interface EmbeddingsProvider {
  model: string;
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}
