import { QdrantClient } from '@qdrant/js-client-rest';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const qrdantUrl = process.env.QDRANT_URL;
  console.log({ qrdantUrl });

  const client = new QdrantClient({
    url: 'https://qdrant-production-442e.up.railway.app',
    // host: 'qdrant-production-442e.up.railway.app',
    // port: 6333,
    // apiKey: process.env.QDRANT_API_KEY,
    // https: true,
    checkCompatibility: false,
  });

  const resultFromClient = await client.getCollections();

  //   console.log({ resultFromClient });

  const response = await fetch(`${qrdantUrl}/collections`);
  const result = await response.json();
  console.log({ result });

  return new Response('Hello, world!');
}
