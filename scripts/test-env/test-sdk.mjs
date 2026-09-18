/**
 * End-to-end checks for @webamigos/ragen-sdk-ts against the live local API and
 * the corpus in scripts/test-env/sample-docs.
 *
 * The SDK is built from its own checkout (dist/index.mjs) rather than pulled
 * from npm, so what is exercised is the code in that repository. The cases
 * walk the surface a consumer actually uses: list/retrieve/upload files, wait
 * for ingest, chat native and OpenAI-compatible, both streamed and not, list
 * assistants, and the error path for a bad key.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SDK_DIR = process.env.SDK_DIR ?? '/home/user/webamigos/ragen-sdk-ts';
const BASE_URL = process.env.API_BASE ?? 'http://127.0.0.1:3001/v1';
const KEY = process.env.RAGEN_API_KEY;
const DOCS =
  process.env.SAMPLE_DOCS ?? '/home/user/RagenAI/scripts/test-env/sample-docs';

if (!KEY) {
  console.error('set RAGEN_API_KEY');
  process.exit(1);
}

const { Ragen, RagenError } = await import(
  path.join(SDK_DIR, 'dist/index.mjs')
);
const require = createRequire(import.meta.url);
const sdkVersion = require(path.join(SDK_DIR, 'package.json')).version;

const results = [];
function record(area, name, ok, detail) {
  results.push({ area, name, ok, detail });
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  [${area}] ${name}${detail ? ` — ${detail}` : ''}`,
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Chat sits in apps/api's `expensive` throttler bucket. A 429 is the API
 * behaving correctly, so the harness waits rather than recording a failure.
 */
async function withBackoff(fn) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      const status = error?.status ?? error?.statusCode;
      if (status !== 429 || attempt >= 4) {
        throw error;
      }
      await sleep(15_000);
    }
  }
}

const client = new Ragen({
  apiKey: KEY,
  baseURL: BASE_URL,
  timeout: 120_000,
});

console.log(`SDK ${sdkVersion} against ${BASE_URL}\n`);

// --- files.list sees the prepared corpus ---------------------------------
let corpus;
try {
  corpus = await client.files.list();
  const names = corpus.data.map((f) => f.filename).sort();
  const expected = [
    'onboarding-checklist.md',
    'polityka-urlopowa.md',
    'procedura-zwrotu-kosztow.md',
    'regulamin-pracy-zdalnej.md',
    'security-incident-runbook.md',
  ];
  const ok = expected.every((name) => names.includes(name));
  record(
    'files.list',
    'lists the five prepared documents',
    ok,
    names.join(', '),
  );
} catch (error) {
  record(
    'files.list',
    'lists the prepared documents',
    false,
    String(error.message).slice(0, 160),
  );
}

// --- files.retrieve ------------------------------------------------------
try {
  const first = corpus.data[0];
  const fetched = await client.files.retrieve(first.id);
  record(
    'files.retrieve',
    'retrieves a document by id',
    fetched.id === first.id && fetched.status === 'processed',
    `${fetched.filename} → ${fetched.status}`,
  );
} catch (error) {
  record(
    'files.retrieve',
    'retrieves a document by id',
    false,
    String(error.message).slice(0, 160),
  );
}

// --- upload + wait for ingest, through the SDK ---------------------------
let uploaded;
try {
  const content = readFileSync(path.join(DOCS, 'polityka-urlopowa.md'), 'utf8')
    .replace('# Polityka urlopowa', '# Polityka urlopowa (kopia SDK)')
    // A fact that exists nowhere else in the corpus, so an answer carrying it
    // can only have come from this upload.
    .concat(
      '\n\n## Dodatek SDK\n\nIdentyfikator kontrolny tego dokumentu to SDKPROBE7788.\n',
    );
  // `uploadAndWait(file, params, waitOptions)` — the file is positional and
  // the filename rides in `params`.
  uploaded = await withBackoff(() =>
    client.files.uploadAndWait(
      new Blob([content], { type: 'text/markdown' }),
      { filename: 'sdk-probe.md', purpose: 'knowledge_base' },
      { timeout: 180_000, pollInterval: 3_000 },
    ),
  );
  record(
    'files.uploadAndWait',
    'uploads a document and waits for ingest',
    uploaded.status === 'processed',
    `${uploaded.filename} → ${uploaded.status}`,
  );
} catch (error) {
  record(
    'files.uploadAndWait',
    'uploads and waits for ingest',
    false,
    String(error.message).slice(0, 200),
  );
}

// --- assistants.list -----------------------------------------------------
try {
  const assistants = await client.assistants.list();
  record(
    'assistants.list',
    'lists the organization’s assistants',
    assistants.data.some((a) => a.name === 'Acme HR Assistant'),
    assistants.data.map((a) => a.name).join(', '),
  );
} catch (error) {
  record(
    'assistants.list',
    'lists assistants',
    false,
    String(error.message).slice(0, 160),
  );
}

// --- native chat, non-streaming ------------------------------------------
const CHAT_CASES = [
  { q: 'Jaki ryczałt miesięczny przysługuje za pracę zdalną?', fact: /180/ },
  {
    q: 'Ile dni urlopu na żądanie przysługuje w roku kalendarzowym?',
    fact: /4 dni/i,
  },
  {
    q: 'How quickly must a SEV1 incident be acknowledged?',
    fact: /15 minutes/i,
  },
];

for (const testCase of CHAT_CASES) {
  try {
    const answer = await withBackoff(() =>
      client.chat.send({ content: testCase.q }),
    );
    record(
      'chat.send',
      testCase.q,
      testCase.fact.test(answer.text),
      answer.text.slice(0, 110).replace(/\s+/g, ' '),
    );
  } catch (error) {
    record('chat.send', testCase.q, false, String(error.message).slice(0, 160));
  }
}

// --- native chat, streamed ----------------------------------------------
try {
  let streamed = '';
  const iterable = client.chat.sendStream({ content: CHAT_CASES[0].q });
  for await (const event of iterable) {
    streamed += event.text ?? '';
  }
  record(
    'chat.sendStream',
    'streams an answer grounded in the corpus',
    CHAT_CASES[0].fact.test(streamed),
    streamed.slice(0, 110).replace(/\s+/g, ' '),
  );
} catch (error) {
  record(
    'chat.sendStream',
    'streams an answer',
    false,
    String(error.message).slice(0, 160),
  );
}

// --- OpenAI-compatible completions, non-streaming ------------------------
try {
  const completion = await withBackoff(() =>
    client.chat.completions.create({
      model: 'stub-chat',
      messages: [{ role: 'user', content: CHAT_CASES[1].q }],
    }),
  );
  const text = completion.choices?.[0]?.message?.content ?? '';
  record(
    'chat.completions.create',
    'OpenAI-compatible answer is grounded',
    CHAT_CASES[1].fact.test(text),
    text.slice(0, 110).replace(/\s+/g, ' '),
  );
} catch (error) {
  record(
    'chat.completions.create',
    'OpenAI-compatible answer',
    false,
    String(error.message).slice(0, 160),
  );
}

// --- OpenAI-compatible completions, streamed -----------------------------
try {
  const text = await withBackoff(() =>
    client.chat.completions.streamToString({
      model: 'stub-chat',
      messages: [{ role: 'user', content: CHAT_CASES[2].q }],
    }),
  );
  record(
    'chat.completions.streamToString',
    'streamed OpenAI-compatible answer is grounded',
    CHAT_CASES[2].fact.test(text),
    text.slice(0, 110).replace(/\s+/g, ' '),
  );
} catch (error) {
  record(
    'chat.completions.streamToString',
    'streamed answer',
    false,
    String(error.message).slice(0, 160),
  );
}

// --- the SDK-uploaded document is retrievable ----------------------------
if (uploaded) {
  try {
    const answer = await withBackoff(() =>
      client.chat.send({
        content: 'Jaki jest identyfikator kontrolny dokumentu SDKPROBE7788?',
      }),
    );
    // KNOWN DEFECT (see the test report): ingest never writes
    // `metadata.accessible_by`, and the chat path retrieves at `member`
    // scope, so a document is invisible to chat until apps/web's
    // `backfill-accessible-by` script runs — even though the API has already
    // reported it `processed` and `/v1/search` can see it. Left failing on
    // purpose: making it pass would mean running the backfill inside the
    // test, which would hide the thing this case exists to show.
    record(
      'grounding',
      'chat answers from a document uploaded through the SDK (KNOWN DEFECT: needs accessible_by backfill)',
      /SDKPROBE7788/.test(answer.text),
      answer.text.slice(0, 110).replace(/\s+/g, ' '),
    );
  } catch (error) {
    record(
      'grounding',
      'answers from the SDK-uploaded document',
      false,
      String(error.message).slice(0, 160),
    );
  }
}

// --- errors --------------------------------------------------------------
try {
  const bad = new Ragen({
    apiKey: 'sk-00000000-0000-0000-0000-000000000000.nope',
    baseURL: BASE_URL,
  });
  await bad.files.list();
  record(
    'errors',
    'a bad API key raises a typed error',
    false,
    'no error raised',
  );
} catch (error) {
  const isRagenError =
    error instanceof RagenError || error?.name === 'RagenError';
  record(
    'errors',
    'a bad API key raises a typed error',
    isRagenError && (error.status === 401 || error.status === 403),
    `${error?.name} status=${error?.status}`,
  );
}

// --- cleanup: remove the probe document ----------------------------------
if (uploaded) {
  try {
    const deleted = await client.files.delete(uploaded.id);
    record(
      'files.delete',
      'deletes the probe document',
      deleted.deleted === true,
      JSON.stringify(deleted).slice(0, 90),
    );
  } catch (error) {
    record(
      'files.delete',
      'deletes the probe document',
      false,
      String(error.message).slice(0, 160),
    );
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length === 0 ? 0 : 1);
