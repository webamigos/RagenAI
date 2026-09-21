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
    try {
      const parsed = JSON.parse(body);
      stream = parsed.stream !== false;
    } catch {
      // default to streaming
    }

    if (stream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      // Send chunks in OpenAI streaming format
      const words = MOCK_RESPONSE.split(' ');
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
              message: { role: 'assistant', content: MOCK_RESPONSE },
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
  } else {
    // Return 200 for any other request (embeddings, etc.)
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
