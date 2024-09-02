import { embeddingModel } from './services/ChatService';

export const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
  const dotProduct = vecA.reduce((sum, a, idx) => sum + a * vecB[idx], 0);
  const magnitudeA = Math.sqrt(vecA.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(vecB.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magnitudeA * magnitudeB);
};

export const getEmbeddings = async (texts: string[]): Promise<number[][]> => {
  return await embeddingModel.embedDocuments(texts);
};

export const selectRelevantChunks = async (
  chunks: string[],
  query: string,
  maxChunks: number = 10
): Promise<string[]> => {
  const queryEmbedding = await getEmbeddings([query]);
  const chunkEmbeddings = await getEmbeddings(chunks);

  const scores = chunkEmbeddings.map((embedding, index) => ({
    chunk: chunks[index],
    score: cosineSimilarity(queryEmbedding[0], embedding),
  }));

  scores.sort((a, b) => b.score - a.score);

  return scores.slice(0, maxChunks).map((item) => item.chunk);
};
