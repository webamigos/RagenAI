/**
 * End-to-end checks for the public API (apps/api) against the corpus in
 * scripts/test-env/sample-docs.
 *
 * Each case names the document that holds the answer and a fact that can only
 * come from it. A case passes when the retrieved context cites that document
 * AND the answer carries the fact — so a pass means retrieval found the right
 * source and the generation step used it, not merely that the route answered.
 */
const BASE = process.env.API_BASE ?? 'http://127.0.0.1:3001';
const KEY = process.env.RAGEN_API_KEY;

if (!KEY) {
  console.error('set RAGEN_API_KEY');
  process.exit(1);
}

const CASES = [
  {
    name: 'ryczałt za pracę zdalną',
    question: 'Jaki ryczałt miesięczny przysługuje za pracę zdalną?',
    expectFile: 'regulamin-pracy-zdalnej.md',
    expectFact: /180/,
  },
  {
    name: 'limit dni pracy zdalnej',
    question: 'Ile dni w miesiącu można pracować zdalnie?',
    expectFile: 'regulamin-pracy-zdalnej.md',
    expectFact: /12/,
  },
  {
    name: 'urlop na żądanie',
    question: 'Ile dni urlopu na żądanie przysługuje w roku kalendarzowym?',
    expectFile: 'polityka-urlopowa.md',
    expectFact: /4 dni/i,
  },
  {
    name: 'limit noclegu w kraju',
    question: 'Jaki jest limit na nocleg w kraju przy podróży służbowej?',
    expectFile: 'procedura-zwrotu-kosztow.md',
    expectFact: /450/,
  },
  {
    name: 'szkolenie BHP',
    question:
      'Ile godzin trwa obowiązkowe szkolenie BHP dla nowego pracownika?',
    expectFile: 'onboarding-checklist.md',
    expectFact: /4 godzin/i,
  },
  {
    name: 'SEV1 acknowledgement time',
    question: 'How quickly must a SEV1 incident be acknowledged?',
    expectFile: 'security-incident-runbook.md',
    expectFact: /15 minutes/i,
  },
];

const headers = {
  authorization: `Bearer ${KEY}`,
  'content-type': 'application/json',
};

async function search(query) {
  const res = await fetch(`${BASE}/v1/search`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    throw new Error(`search ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The chat route sits in the `expensive` throttler bucket (10/min outside an
 * automated-test TARGET_ENV), which this suite would otherwise trip halfway
 * through. A 429 is the API behaving correctly, so the harness waits it out
 * rather than reporting it as a failure.
 */
async function postChat(body) {
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (res.status !== 429 || attempt >= 4) {
      return res;
    }
    await sleep(15_000);
  }
}

async function chat(question, { stream }) {
  const res = await postChat({
    model: 'stub-chat',
    stream,
    messages: [{ role: 'user', content: question }],
  });
  if (!res.ok) {
    throw new Error(`chat ${res.status}: ${await res.text()}`);
  }
  if (!stream) {
    const body = await res.json();
    return body.choices?.[0]?.message?.content ?? '';
  }
  const text = await res.text();
  let out = '';
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) {
      continue;
    }
    const payload = line.slice(6).trim();
    if (payload === '[DONE]') {
      break;
    }
    try {
      out += JSON.parse(payload).choices?.[0]?.delta?.content ?? '';
    } catch {
      // a keepalive or a non-JSON frame
    }
  }
  return out;
}

const results = [];
function record(area, name, ok, detail) {
  results.push({ area, name, ok, detail });
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  [${area}] ${name}${detail ? ` — ${detail}` : ''}`,
  );
}

// --- retrieval ------------------------------------------------------------
for (const testCase of CASES) {
  try {
    const { context, file_ids: fileIds } = await search(testCase.question);
    const cited = [...context.matchAll(/file="([^"]+)"/g)].map((m) => m[1]);
    const ok = cited.includes(testCase.expectFile);
    record(
      'search',
      testCase.name,
      ok,
      ok
        ? `cited ${testCase.expectFile}, ${fileIds.length} file id(s)`
        : `expected ${testCase.expectFile}, got ${[...new Set(cited)].join(', ') || 'nothing'}`,
    );
  } catch (error) {
    record('search', testCase.name, false, String(error.message).slice(0, 200));
  }
}

// --- generation, non-streaming -------------------------------------------
for (const testCase of CASES) {
  try {
    const answer = await chat(testCase.question, { stream: false });
    const ok = testCase.expectFact.test(answer);
    record(
      'chat',
      testCase.name,
      ok,
      ok
        ? answer.slice(0, 90).replace(/\s+/g, ' ')
        : `no match in: ${answer.slice(0, 140).replace(/\s+/g, ' ')}`,
    );
  } catch (error) {
    record('chat', testCase.name, false, String(error.message).slice(0, 200));
  }
}

// --- generation, streaming -----------------------------------------------
try {
  const first = CASES[0];
  const answer = await chat(first.question, { stream: true });
  const ok = first.expectFact.test(answer);
  record(
    'chat-stream',
    first.name,
    ok,
    answer.slice(0, 90).replace(/\s+/g, ' '),
  );
} catch (error) {
  record(
    'chat-stream',
    CASES[0].name,
    false,
    String(error.message).slice(0, 200),
  );
}

// --- a question the corpus cannot answer ---------------------------------
// Only that the route stays well-behaved. Whether the model *refuses* to
// answer off-corpus is a property of the model, and the model here is a stub
// that always extracts something — asserting a refusal would be testing the
// stub, not apps/api.
try {
  const answer = await chat(
    'What is the airspeed velocity of an unladen swallow?',
    { stream: false },
  );
  record(
    'grounding',
    'out-of-corpus question still returns a well-formed answer',
    answer.length > 0,
    answer.slice(0, 100).replace(/\s+/g, ' '),
  );
} catch (error) {
  record(
    'grounding',
    'out-of-corpus question',
    false,
    String(error.message).slice(0, 200),
  );
}

// --- auth ----------------------------------------------------------------
for (const [name, key] of [
  ['missing key is rejected', null],
  ['malformed key is rejected', 'sk-not-a-uuid.secret'],
  ['wrong secret is rejected', `${KEY.split('.')[0]}.wrongsecretwrongsecret`],
]) {
  const res = await fetch(`${BASE}/v1/files`, {
    headers: key ? { authorization: `Bearer ${key}` } : {},
  });
  record(
    'auth',
    name,
    res.status === 401 || res.status === 403,
    `HTTP ${res.status}`,
  );
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length === 0 ? 0 : 1);
