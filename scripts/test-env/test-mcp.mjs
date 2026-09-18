/**
 * End-to-end checks for apps/mcp, driven through a real MCP client over the
 * HTTP-stream transport — the same path Claude Desktop or Cursor would take.
 *
 * apps/mcp is a thin forwarder: it authenticates the Bearer token, calls
 * apps/api and returns the result. So what these cases prove is the seam —
 * the tools are advertised, the Authorization header survives the hop, the
 * answers are the ones apps/api gives for the same corpus, and a request with
 * no credential is refused before it reaches apps/api.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const URL_MCP = process.env.MCP_URL ?? 'http://127.0.0.1:3300/mcp';
const KEY = process.env.RAGEN_API_KEY;

if (!KEY) {
  console.error('set RAGEN_API_KEY');
  process.exit(1);
}

const results = [];
function record(area, name, ok, detail) {
  results.push({ area, name, ok, detail });
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  [${area}] ${name}${detail ? ` — ${detail}` : ''}`,
  );
}

async function connect(apiKey) {
  const transport = new StreamableHTTPClientTransport(new URL(URL_MCP), {
    requestInit: apiKey
      ? { headers: { Authorization: `Bearer ${apiKey}` } }
      : undefined,
  });
  const client = new Client({ name: 'ragen-offline-test', version: '1.0.0' });
  await client.connect(transport);
  return { client, transport };
}

function textOf(result) {
  return (result.content ?? [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The chat tool lands in apps/api's `expensive` bucket — wait a 429 out. */
async function callWithBackoff(client, name, args) {
  for (let attempt = 0; ; attempt += 1) {
    const result = await client.callTool({ name, arguments: args });
    const text = textOf(result);
    if (!/429|Too Many Requests/i.test(text) || attempt >= 4) {
      return text;
    }
    await sleep(15_000);
  }
}

// --- an unauthenticated client is refused --------------------------------
// Checked at the transport rather than through the SDK client: the SDK wraps
// the HTTP status in a generic "Error POSTing to endpoint", so asserting on
// its message would prove only that something went wrong, not that the server
// answered 401.
{
  const res = await fetch(URL_MCP, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'no-credential', version: '1.0.0' },
      },
    }),
  });
  record(
    'auth',
    'connection without a Bearer token is refused',
    res.status === 401,
    `HTTP ${res.status}`,
  );
}

const { client, transport } = await connect(KEY);

// --- the tools are advertised --------------------------------------------
const { tools } = await client.listTools();
const names = tools.map((t) => t.name).sort();
for (const expected of [
  'ragen_chat',
  'ragen_list_assistants',
  'ragen_search_knowledge_base',
]) {
  record(
    'tools',
    `${expected} is advertised`,
    names.includes(expected),
    names.join(', '),
  );
}

// --- list_assistants sees the seeded assistant ---------------------------
try {
  const text = await callWithBackoff(client, 'ragen_list_assistants', {});
  record(
    'ragen_list_assistants',
    'returns the organization’s assistants',
    /Acme HR Assistant/.test(text),
    text.slice(0, 120).replace(/\s+/g, ' '),
  );
} catch (error) {
  record(
    'ragen_list_assistants',
    'returns assistants',
    false,
    String(error.message).slice(0, 150),
  );
}

// --- search returns the right source document ----------------------------
const SEARCH_CASES = [
  {
    query: 'Jaki ryczałt za pracę zdalną?',
    expectFile: 'regulamin-pracy-zdalnej.md',
  },
  {
    query: 'limit na nocleg w kraju',
    expectFile: 'procedura-zwrotu-kosztow.md',
  },
  {
    query: 'How fast must a SEV1 be acknowledged?',
    expectFile: 'security-incident-runbook.md',
  },
];

for (const testCase of SEARCH_CASES) {
  try {
    const text = await callWithBackoff(client, 'ragen_search_knowledge_base', {
      query: testCase.query,
    });
    record(
      'ragen_search_knowledge_base',
      testCase.query,
      text.includes(testCase.expectFile),
      text.includes(testCase.expectFile)
        ? `cited ${testCase.expectFile}`
        : text.slice(0, 160).replace(/\s+/g, ' '),
    );
  } catch (error) {
    record(
      'ragen_search_knowledge_base',
      testCase.query,
      false,
      String(error.message).slice(0, 150),
    );
  }
}

// --- chat answers from the corpus ----------------------------------------
// Written with Polish diacritics on purpose: the offline environment's
// embedding stub is lexical, so "miesieczny" and "miesięcznie" are different
// tokens to it and a de-accented question retrieves differently. A real
// embedding model would not care; the test corpus is accented, so the
// questions are too.
const CHAT_CASES = [
  {
    message: 'Jaki ryczałt miesięczny przysługuje za pracę zdalną?',
    expectFact: /180/,
  },
  {
    message: 'Ile dni urlopu na żądanie przysługuje w roku kalendarzowym?',
    expectFact: /4 dni/i,
  },
  {
    message: 'How quickly must a SEV1 incident be acknowledged?',
    expectFact: /15 minutes/i,
  },
];

for (const testCase of CHAT_CASES) {
  try {
    const text = await callWithBackoff(client, 'ragen_chat', {
      message: testCase.message,
    });
    record(
      'ragen_chat',
      testCase.message,
      testCase.expectFact.test(text),
      text.slice(0, 130).replace(/\s+/g, ' '),
    );
  } catch (error) {
    record(
      'ragen_chat',
      testCase.message,
      false,
      String(error.message).slice(0, 150),
    );
  }
}

await client.close();
await transport.close?.();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length === 0 ? 0 : 1);
