/**
 * Mock LLM server that mimics LiteLLM's OpenAI-compatible API.
 * Used by e2e tests so chat thread tests work without a real LLM.
 *
 * Handles:
 *   POST /v1/chat/completions — returns a canned streaming SSE response
 *   GET  /v1/models           — returns a list of fake models
 *   GET  /health              — returns OK
 */

import http from 'http';

const PORT = parseInt(process.env.MOCK_LLM_PORT || '4100', 10);
const MOCK_RESPONSE = 'This is a mock AI response for e2e testing.';

/**
 * A prompt can ask for a token to come back in the answer.
 *
 * Output guardrails need an answer that matches a rule, and this server
 * answers every prompt with the same sentence — so a fixture matching that
 * sentence would refuse every chat spec in the suite rather than the one under
 * test. Echoing a token the prompt carries keeps the blast radius to the spec
 * that asks for it.
 */
const ECHO_REQUEST = /zzqx-echo-([a-z0-9-]{1,40})/i;

function responseFor(body: string): string {
  const match = ECHO_REQUEST.exec(body);
  return match ? `${MOCK_RESPONSE} Echo: zzqx-echo-${match[1]}` : MOCK_RESPONSE;
}

/**
 * The chain asks for a JSON object, and the AI SDK does not send a schema.
 *
 * `rephraseAndExpand` calls `generateObject`, which puts
 * `response_format: { type: 'json_object' }` on the request and **no schema** —
 * so this cannot derive the shape and has to know it. It encodes the one
 * contract the chain asks for today: `standaloneQuestion` plus `variants`.
 *
 * If that shape changes, this reply stops validating and the chain falls back
 * to the raw question with a warning — which is exactly what it did before
 * this function existed. The cost of drift is "back to today", not a wrong
 * test result, and that is why encoding one known shape is acceptable here
 * where guessing at a schema would not be.
 *
 * It matters because answering prose made every turn burn the SDK's retries
 * first: most of the fifteen seconds a turn used to cost, which is why
 * assertions kept timing out.
 */
function structuredReply(parsed: {
  response_format?: { type?: string };
  messages?: { role?: string; content?: string }[];
}): string | null {
  const type = parsed.response_format?.type;
  if (type !== 'json_object' && type !== 'json_schema') {
    return null;
  }

  const lastUser = [...(parsed.messages ?? [])]
    .reverse()
    .find((message) => message.role === 'user');

  // The question as asked, which is what a rephraser that did nothing would
  // return — and it keeps the token a spec put in the prompt reachable
  // downstream.
  return JSON.stringify({
    standaloneQuestion: lastUser?.content ?? '',
    variants: [],
  });
}

function handleChatCompletions(
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  // Check if streaming is requested
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    let stream = true;
    let structured: string | null = null;
    try {
      const parsed = JSON.parse(body);
      stream = parsed.stream !== false;
      structured = structuredReply(parsed);
    } catch {
      // default to streaming
    }

    const responseText = structured ?? responseFor(body);

    // **A structured request is never streamed**, whatever `stream` says.
    // `generateObject` sends no `stream` field at all, and the default here is
    // to stream — so it received SSE frames where it expected a JSON body,
    // failed validation, spent its retries and fell back. That was the
    // rephraser's failure all along, and answering with a well-shaped object
    // over SSE would not have fixed it.
    if (stream && !structured) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      // Send chunks in OpenAI streaming format
      const words = responseText.split(' ');
      for (const word of words) {
        const chunk = {
          id: 'chatcmpl-mock',
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: 'mock-model',
          choices: [
            {
              index: 0,
              delta: { content: word + ' ' },
              finish_reason: null,
            },
          ],
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      // Send final chunk with finish_reason
      const finalChunk = {
        id: 'chatcmpl-mock',
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: 'mock-model',
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: 'stop',
          },
        ],
      };
      res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      // Non-streaming response
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'chatcmpl-mock',
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'mock-model',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: responseText },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 10,
            total_tokens: 20,
          },
        }),
      );
    }
  });
}

/**
 * An embeddings reply with the shape a client can parse.
 *
 * The catch-all used to answer `{ status: 'ok' }` here, which is a 200 that no
 * embeddings client can read. Nothing failed on it, because this job has no
 * vector store and therefore no turn that gets far enough to embed — the model
 * was only ever *resolved*, and that is the route table's problem rather than
 * this one's.
 *
 * So this is for the run that comes after a vector store does. The dimension
 * is small and the values are deterministic: nothing asserts either today, and
 * a spec that needs real similarity needs a real embedder, not a better
 * pretend one.
 */
function handleEmbeddings(req: http.IncomingMessage, res: http.ServerResponse) {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    let count = 1;
    try {
      const parsed = JSON.parse(body);
      count = Array.isArray(parsed.input) ? parsed.input.length : 1;
    } catch {
      // one vector is a safe answer to a body we could not read
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        object: 'list',
        model: 'mock-model',
        data: Array.from({ length: count }, (_, index) => ({
          object: 'embedding',
          index,
          embedding: Array.from({ length: 8 }, (_, i) => (i + 1) / 10),
        })),
        usage: { prompt_tokens: 1, total_tokens: 1 },
      }),
    );
  });
}

function handleModels(res: http.ServerResponse) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      object: 'list',
      data: [
        {
          id: 'mock-model',
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: 'e2e-mock',
        },
      ],
    }),
  );
}

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url || '';

  if (url.includes('/v1/chat/completions') && req.method === 'POST') {
    handleChatCompletions(req, res);
  } else if (url.includes('/v1/models')) {
    handleModels(res);
  } else if (url.includes('/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy' }));
  } else if (url.includes('/v1/embeddings') && req.method === 'POST') {
    handleEmbeddings(req, res);
  } else {
    // Return 200 for any other request
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
  }
});

server.listen(PORT, () => {
  console.log(`[mock-llm] Listening on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
