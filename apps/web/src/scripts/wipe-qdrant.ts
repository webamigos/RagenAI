/* eslint-disable no-console */
/**
 * Deletes ALL Qdrant collections. Use after switching embedding model with a
 * different vector dimension (e.g. cohere 1024 -> bge gemma2 3584).
 *
 * Usage:
 *   npx tsx src/scripts/wipe-qdrant.ts            # interactive confirm
 *   npx tsx src/scripts/wipe-qdrant.ts --yes      # skip confirmation
 *   npx tsx src/scripts/wipe-qdrant.ts <name>     # delete one collection
 *
 * After wiping, re-upload documents (each Temporal ingest workflow recreates
 * the collection on first upsert with current VECTOR_SIZE).
 */
import 'dotenv/config';
import { QdrantClient } from '@qdrant/js-client-rest';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

async function main() {
  const args = process.argv.slice(2);
  const yes = args.includes('--yes') || args.includes('-y');
  const explicit = args.find((a) => !a.startsWith('-'));

  const client = new QdrantClient({
    url: process.env.QDRANT_URL || 'http://localhost:6333',
    apiKey: process.env.QDRANT_API_KEY,
  });

  let names: string[];
  if (explicit) {
    names = [explicit];
  } else {
    const { collections } = await client.getCollections();
    names = collections.map((c) => c.name);
  }

  if (names.length === 0) {
    console.log('No collections to delete.');
    return;
  }

  console.log(`Will DELETE ${names.length} collection(s):`);
  for (const n of names) {
    console.log(`  - ${n}`);
  }

  if (!yes) {
    const rl = createInterface({ input: stdin, output: stdout });
    const ans = await rl.question('Type "yes" to confirm: ');
    rl.close();
    if (ans.trim().toLowerCase() !== 'yes') {
      console.log('Aborted.');
      return;
    }
  }

  for (const name of names) {
    process.stdout.write(`Deleting ${name}... `);
    await client.deleteCollection(name);
    console.log('OK');
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
