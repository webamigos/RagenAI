/**
 * End-to-end RAG smoke test against a *live* stack.
 *
 * Unlike the promptfoo evals next door (which use `MockVectorStoreClient` and
 * therefore never touch real retrieval), this drives the real production path:
 *
 *   POST /api/upload -> storage -> Temporal -> ragen-worker -> Docling
 *     -> chunking -> embeddings -> Qdrant -> RAG chat
 *
 * It uploads a file whose facts are entirely invented, then asks questions
 * whose answers exist nowhere else. A correct answer therefore proves
 * retrieval actually worked, rather than the model recalling something from
 * training.
 *
 * Two scenarios exist: `pdf` (ADR-18 section-aware PDF chunking, the
 * original) and `xlsx` (ADR-17 row-group chunking — CSV/XLSX had no
 * end-to-end retrieval test anywhere in the repo before this). Select with
 * `RAG_EVAL_SCENARIO`; defaults to `pdf` so existing usage is unchanged.
 *
 * See ./README.md for the services that must be running.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

const APP_URL = process.env.RAG_EVAL_APP_URL ?? 'http://localhost:3000';
const EMAIL = process.env.RAG_EVAL_EMAIL ?? 'e2e-test@ragen.ai';
const PASSWORD = process.env.RAG_EVAL_PASSWORD ?? 'E2eTestPassword123!';
const PROJECT_ID =
  process.env.RAG_EVAL_PROJECT_ID ?? 'e2e00000-0000-0000-0000-00e2e0000001';
const THREAD_ID =
  process.env.RAG_EVAL_THREAD_ID ?? 'e2e00000-0000-0000-0000-00e2e0000010';
/** Ingestion runs an LLM over the document, so this is minutes, not seconds. */
const INGEST_TIMEOUT_MS = Number(process.env.RAG_EVAL_TIMEOUT_MS ?? 300_000);

const SCENARIOS = {
  pdf: {
    fixtureName: 'regulamin-wilczy-mlyn.pdf',
    mimeType: 'application/pdf',
    casesFile: 'cases.json',
  },
  xlsx: {
    fixtureName: 'rejestr-zamowien-it.xlsx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    casesFile: 'cases.xlsx.json',
  },
} as const;

const SCENARIO_NAME = (process.env.RAG_EVAL_SCENARIO ??
  'pdf') as keyof typeof SCENARIOS;
const SCENARIO = SCENARIOS[SCENARIO_NAME];
if (!SCENARIO) {
  throw new Error(
    `Nieznany scenariusz RAG_EVAL_SCENARIO=${SCENARIO_NAME}. Dostepne: ${Object.keys(SCENARIOS).join(', ')}`,
  );
}

const FIXTURE = join(__dirname, 'fixtures', SCENARIO.fixtureName);
const FIXTURE_NAME = SCENARIO.fixtureName;

type Case = {
  name: string;
  question: string;
  expectAll?: string[];
  expectAny?: string[];
  expectNone?: string[];
  why?: string;
};

/** Collapse whitespace so "2 847" matches regardless of NBSP or line breaks. */
function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').toLowerCase();
}

function assertCase(c: Case, answer: string): string[] {
  const hay = normalize(answer);
  const failures: string[] = [];

  for (const needle of c.expectAll ?? []) {
    if (!hay.includes(normalize(needle))) {
      failures.push(`brakuje: "${needle}"`);
    }
  }
  if (c.expectAny?.length) {
    const hit = c.expectAny.some((n) => hay.includes(normalize(n)));
    if (!hit) {
      failures.push(
        `zaden z wariantow nie wystapil: ${c.expectAny.join(' | ')}`,
      );
    }
  }
  for (const needle of c.expectNone ?? []) {
    if (hay.includes(normalize(needle))) {
      failures.push(`nie powinno wystapic: "${needle}"`);
    }
  }
  return failures;
}

async function login(): Promise<string> {
  const res = await fetch(`${APP_URL}/api/auth/sign-in/email`, {
    method: 'POST',
    // Better Auth rejects a missing/null Origin with 403
    // (MISSING_OR_NULL_ORIGIN), and Node's fetch sends `null` unless told
    // otherwise — so every request here mimics a browser on the app's origin.
    headers: { 'Content-Type': 'application/json', Origin: APP_URL },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(`Logowanie nie powiodlo sie (${res.status})`);
  }
  const cookies = res.headers.getSetCookie?.() ?? [];
  const cookie = cookies.map((c) => c.split(';')[0]).join('; ');
  if (!cookie) {
    throw new Error('Brak ciasteczka sesji w odpowiedzi logowania');
  }
  return cookie;
}

async function upload(cookie: string): Promise<void> {
  const form = new FormData();
  const bytes = new Uint8Array(readFileSync(FIXTURE));
  form.append(
    'files',
    new File([bytes], FIXTURE_NAME, { type: SCENARIO.mimeType }),
  );
  form.append('projectId', PROJECT_ID);

  const res = await fetch(`${APP_URL}/api/upload`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: APP_URL },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Upload nie powiodl sie (${res.status}): ${text}`);
  }
  console.log(`  upload OK: ${text.slice(0, 120)}`);
}

async function waitForIngest(prisma: PrismaClient): Promise<void> {
  const deadline = Date.now() + INGEST_TIMEOUT_MS;
  let last = '';
  while (Date.now() < deadline) {
    const file = await prisma.userFile.findFirst({
      where: { fileName: FIXTURE_NAME },
      orderBy: { createdAt: 'desc' },
      select: { parsingStatus: true, embeddingStatus: true },
    });
    const state = `${file?.parsingStatus} / ${file?.embeddingStatus}`;
    if (state !== last) {
      console.log(`  status: ${state}`);
      last = state;
    }
    if (file?.embeddingStatus === 'COMPLETED') {
      return;
    }
    if (
      file?.parsingStatus === 'FAILED' ||
      file?.embeddingStatus === 'FAILED'
    ) {
      throw new Error(`Indeksowanie nie powiodlo sie (${state})`);
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }
  throw new Error(
    `Indeksowanie nie zakonczylo sie w ${INGEST_TIMEOUT_MS / 1000}s (ostatni status: ${last})`,
  );
}

/** The chat endpoint streams SSE; concatenate the `content` deltas. */
async function ask(cookie: string, question: string): Promise<string> {
  const res = await fetch(`${APP_URL}/api/threads/${THREAD_ID}?mode=rag`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
      Origin: APP_URL,
    },
    body: JSON.stringify({
      prompt: question,
      mode: 'rag',
      // No knowledgeScope here: it is a property of the thread, set when the
      // thread is created, and KNOWLEDGE_BASE is the default this eval wants.
      // `useKnowledge: true` used to sit here and did nothing.
    }),
  });
  if (!res.ok) {
    throw new Error(`Zapytanie nie powiodlo sie (${res.status})`);
  }
  const raw = await res.text();
  const parts: string[] = [];
  for (const m of raw.matchAll(/^data: (\{.*\})$/gm)) {
    try {
      const d = JSON.parse(m[1]) as { content?: string };
      if (typeof d.content === 'string') {
        parts.push(d.content);
      }
    } catch {
      // Non-JSON SSE frames (heartbeats, control events) are expected.
    }
  }
  return parts.join('');
}

/**
 * Wipe the thread's message history.
 *
 * The suite reuses one seeded thread, so without this every run inherits the
 * previous one's messages — and the model answers from them. That silently
 * broke the privacy assertion: masking was working, the document no longer
 * contained the name, but the model reported it anyway, citing "our earlier
 * conversation". A stale history can make any assertion here pass or fail for
 * the wrong reason, so it is cleared before the questions run, not just after.
 */
async function clearThreadHistory(prisma: PrismaClient): Promise<void> {
  // Thread.id is itself the UUID used in URLs — there is no separate publicId.
  const { count } = await prisma.message.deleteMany({
    where: { threadId: THREAD_ID },
  });
  console.log(`  wyczyszczono wiadomosci watku: ${count}`);
}

async function cleanup(prisma: PrismaClient): Promise<void> {
  const { count } = await prisma.userFile.deleteMany({
    where: { fileName: FIXTURE_NAME },
  });
  console.log(`  usunieto rekordow pliku: ${count}`);
  await clearThreadHistory(prisma);
}

async function main(): Promise<void> {
  const { cases } = JSON.parse(
    readFileSync(join(__dirname, SCENARIO.casesFile), 'utf8'),
  ) as { cases: Case[] };

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  let failed = 0;
  try {
    console.log(`Scenariusz: ${SCENARIO_NAME} (${FIXTURE_NAME})`);
    console.log(`\n[1/4] Logowanie jako ${EMAIL}`);
    const cookie = await login();

    console.log(`[2/4] Wysylanie ${FIXTURE_NAME}`);
    await upload(cookie);

    console.log('[3/4] Oczekiwanie na indeksowanie');
    await waitForIngest(prisma);

    console.log('[4/4] Czyszczenie historii watku');
    await clearThreadHistory(prisma);

    console.log(`\nPytania (${cases.length})\n`);
    for (const c of cases) {
      const answer = await ask(cookie, c.question);
      const failures = assertCase(c, answer);
      if (failures.length === 0) {
        console.log(`  PASS  ${c.name}`);
      } else {
        failed++;
        console.log(`  FAIL  ${c.name}`);
        failures.forEach((f) => console.log(`        - ${f}`));
        console.log(`        odpowiedz: ${answer.slice(0, 300)}`);
      }
    }
  } finally {
    console.log('\nSprzatanie');
    await cleanup(prisma).catch((e: unknown) =>
      console.log(`  uwaga: sprzatanie nie powiodlo sie: ${String(e)}`),
    );
    await prisma.$disconnect();
  }

  console.log(
    failed === 0
      ? `\nWYNIK: wszystkie ${cases.length} przypadkow OK\n`
      : `\nWYNIK: ${failed} z ${cases.length} przypadkow NIE PRZESZLO\n`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error('\nBLAD:', e instanceof Error ? e.message : e);
  process.exit(1);
});
