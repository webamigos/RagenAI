/**
 * A local OpenAI-compatible model server for the offline test environment.
 *
 * This box has no egress to any real model provider (Azure, Bedrock, Vertex and
 * Scaleway are all unreachable, and there are no credentials), so the routes in
 * `infra/llm-gateway/routes.local-stub.yaml` point `connection: scaleway` at
 * this process instead. It implements the two endpoints the application uses:
 *
 *   POST /v1/embeddings        — deterministic hashed bag-of-words vectors
 *   POST /v1/chat/completions  — extractive answer, streaming or not
 *
 * The embeddings are NOT semantic, but they are lexical: the same token always
 * lands on the same dimension, so a query and a chunk sharing rare words score
 * high against each other. That is enough to exercise retrieval end to end —
 * chunking, the Qdrant round-trip, hybrid search and reranking order — which is
 * what these tests are about. It is not a substitute for measuring answer
 * quality (ADR-20); nothing here says anything about how a real model answers.
 *
 * The chat side answers strictly from the context the application puts in the
 * prompt: it scores each context sentence against the user's question and
 * returns the best ones verbatim, prefixed with a marker. That makes the answer
 * a direct, checkable function of what retrieval actually supplied — if the
 * right document was not retrieved, the answer cannot contain the right fact.
 */
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

const PORT = Number(process.env.STUB_LLM_PORT ?? 4599);
const DIMS = Number(process.env.STUB_LLM_DIMS ?? 384);

const log = (...args) => console.log('[stub-llm]', ...args);

/** Lowercase word tokens, 2+ chars, Unicode-aware (the corpus is Polish too). */
function tokenize(text) {
  return (
    String(text ?? '')
      .toLowerCase()
      .match(/[\p{L}\p{N}]{2,}/gu) ?? []
  );
}

/**
 * Hashed bag of words, L2-normalised. Each token contributes to two dimensions
 * (two independent hashes) to soften collisions at 384 dims.
 */
function embed(text) {
  const vec = new Float64Array(DIMS);
  const tokens = tokenize(text);
  for (const token of tokens) {
    const digest = createHash('sha1').update(token).digest();
    const a = digest.readUInt32BE(0) % DIMS;
    const b = digest.readUInt32BE(4) % DIMS;
    vec[a] += 1;
    vec[b] += 1;
  }
  let norm = 0;
  for (const value of vec) {
    norm += value * value;
  }
  norm = Math.sqrt(norm);
  if (norm === 0) {
    // A zero vector is rejected by some stores and is meaningless in cosine
    // space; park empty text on one fixed dimension instead.
    vec[0] = 1;
    norm = 1;
  }
  return Array.from(vec, (value) => value / norm);
}

/**
 * Narrow a prompt to the retrieved documents inside it.
 *
 * The application wraps each retrieved chunk in `<chunk file="...">...</chunk>`
 * (see apps/api's context renderer). The rest of the prompt is instructions,
 * and those sentences repeat the user's own words — "answer the user's
 * question" scores higher against a question than any document sentence does,
 * so scoring the whole prompt makes the stub quote the prompt back. Keeping
 * only the chunk bodies means the answer can come from nowhere but retrieval,
 * which is the property these tests check.
 *
 * A prompt with no chunk markers falls back to the whole text.
 */
function retrievedOnly(context) {
  const bodies = [
    ...String(context ?? '').matchAll(/<chunk\b[^>]*>([\s\S]*?)<\/chunk>/g),
  ].map((match) => match[1]);
  return bodies.length > 0 ? bodies.join('\n') : context;
}

/**
 * Sentences, not lines.
 *
 * The corpus is hard-wrapped markdown, so a single newline usually sits in the
 * middle of a sentence ("ryczalt w wysokosci\n180 zlotych"). Splitting on every
 * newline cut facts in half and made an extracted answer read as if the number
 * were missing. Single newlines are collapsed to spaces first; only a blank
 * line or sentence-ending punctuation starts a new sentence.
 */
function splitSentences(text) {
  return String(text ?? '')
    .replace(/([^\n])\n(?!\n)/gu, '$1 ')
    .split(/(?<=[.!?])\s+|\n{2,}/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);
}

/** Overlap score between a question and a candidate sentence. */
function overlap(questionTokens, sentence) {
  const tokens = new Set(tokenize(sentence));
  let hits = 0;
  for (const token of questionTokens) {
    if (tokens.has(token)) {
      hits += 1;
    }
  }
  return hits;
}

/**
 * Build an answer out of the prompt the application supplied.
 *
 * Everything that is not the last user turn is treated as context (that is
 * where the RAG chain puts the retrieved chunks — system prompt or a preceding
 * turn, depending on the chain). The reply is the best-matching sentences from
 * that context, so it can only contain what retrieval found.
 */
function answerFrom(messages) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const question = flattenContent(lastUser?.content);
  const context = messages
    .filter((m) => m !== lastUser)
    .map((m) => flattenContent(m.content))
    .join('\n');

  // Summarisation (ADR-16 runs one per document at ingest) puts the whole
  // document in the user turn and the instructions in the system turn, which
  // is the mirror image of a chat turn. Scoring it the normal way would make
  // the "answer" a copy of the summarisation prompt, and that text would then
  // be embedded as the document's summary chunk and pollute retrieval. Detect
  // it by shape and return the document's own opening sentences instead.
  if (question.length > 600 && !/<chunk\b/.test(context)) {
    const opening = splitSentences(question).slice(0, 4).join(' ');
    return `STUB-SUMMARY: ${opening}`.slice(0, 900);
  }

  const questionTokens = new Set(tokenize(question));
  const scored = splitSentences(retrievedOnly(context))
    .map((sentence) => ({ sentence, score: overlap(questionTokens, sentence) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (scored.length === 0) {
    return 'STUB-NO-CONTEXT: nothing in the supplied context matches the question.';
  }
  return `STUB-ANSWER: ${scored.map((entry) => entry.sentence).join(' ')}`;
}

function flattenContent(content) {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : (part?.text ?? '')))
      .join(' ');
  }
  return '';
}

function countTokens(text) {
  return tokenize(text).length || 1;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/health') {
    return json(res, 200, { status: 'ok', dims: DIMS });
  }

  if (url.pathname === '/v1/models' && req.method === 'GET') {
    return json(res, 200, {
      object: 'list',
      data: [
        { id: 'stub-chat', object: 'model', owned_by: 'stub' },
        { id: 'stub-embed', object: 'model', owned_by: 'stub' },
      ],
    });
  }

  if (url.pathname === '/v1/moderations' && req.method === 'POST') {
    // apps/api builds a moderation client on every chat request even when
    // MODERATION_ENABLED is off, so the stub answers here too. Nothing is
    // flagged: this environment is not testing moderation.
    const body = await readBody(req).catch(() => ({}));
    const inputs = Array.isArray(body.input) ? body.input : [body.input ?? ''];
    return json(res, 200, {
      id: `modr-stub-${Date.now()}`,
      model: body.model ?? 'text-moderation-latest',
      results: inputs.map(() => ({
        flagged: false,
        categories: {},
        category_scores: {},
      })),
    });
  }

  if (url.pathname === '/v1/embeddings' && req.method === 'POST') {
    const body = await readBody(req).catch(() => null);
    if (!body) {
      return json(res, 400, { error: { message: 'invalid JSON' } });
    }
    const inputs = Array.isArray(body.input) ? body.input : [body.input];
    const data = inputs.map((input, index) => ({
      object: 'embedding',
      index,
      embedding: embed(input),
    }));
    log(`embeddings: ${inputs.length} input(s)`);
    return json(res, 200, {
      object: 'list',
      model: body.model ?? 'stub-embed',
      data,
      usage: {
        prompt_tokens: inputs.reduce((sum, i) => sum + countTokens(i), 0),
        total_tokens: inputs.reduce((sum, i) => sum + countTokens(i), 0),
      },
    });
  }

  if (url.pathname === '/v1/chat/completions' && req.method === 'POST') {
    const body = await readBody(req).catch(() => null);
    if (!body) {
      return json(res, 400, { error: { message: 'invalid JSON' } });
    }
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (process.env.STUB_LLM_DUMP) {
      // Keeps the exact prompt the application built, for working out where
      // the retrieved context lands in it.
      await import('node:fs').then(({ appendFileSync }) =>
        appendFileSync(
          process.env.STUB_LLM_DUMP,
          `${JSON.stringify({ messages, response_format: body.response_format, tools: body.tools })}\n`,
        ),
      );
    }

    // Structured output. The RAG chain asks for `{type: "json_object"}` in one
    // place only — rephrase-and-expand (ADR-15) — and the AI SDK validates the
    // reply against a Zod schema, so free text fails the parse and the chain
    // falls back to the raw question. Answering it properly is what makes the
    // multi-query stage real in this environment rather than permanently
    // degraded.
    if (body.response_format?.type === 'json_object') {
      const asked = flattenContent(
        [...messages].reverse().find((m) => m.role === 'user')?.content,
      );
      const question = (asked.match(/Question:\s*(.+)$/m)?.[1] ?? asked).trim();
      const structured = JSON.stringify({
        standaloneQuestion: question,
        // A real model paraphrases here. The stub cannot, and inventing words
        // would only add noise to retrieval, so it returns no variants: the
        // multi-query stage runs, with one query.
        variants: [],
      });
      log('structured (json_object) reply');
      return json(res, 200, {
        id: `chatcmpl-stub-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: body.model ?? 'stub-chat',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: structured },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: countTokens(asked),
          completion_tokens: countTokens(structured),
          total_tokens: countTokens(asked) + countTokens(structured),
        },
      });
    }
    const answer = answerFrom(messages);
    const promptTokens = messages.reduce(
      (sum, m) => sum + countTokens(flattenContent(m.content)),
      0,
    );
    const completionTokens = countTokens(answer);
    const id = `chatcmpl-stub-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);
    const model = body.model ?? 'stub-chat';
    log(`chat: ${messages.length} message(s), stream=${Boolean(body.stream)}`);

    if (body.stream) {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      const words = answer.split(' ');
      res.write(
        `data: ${JSON.stringify({
          id,
          object: 'chat.completion.chunk',
          created,
          model,
          choices: [
            { index: 0, delta: { role: 'assistant' }, finish_reason: null },
          ],
        })}\n\n`,
      );
      for (const word of words) {
        res.write(
          `data: ${JSON.stringify({
            id,
            object: 'chat.completion.chunk',
            created,
            model,
            choices: [
              { index: 0, delta: { content: `${word} ` }, finish_reason: null },
            ],
          })}\n\n`,
        );
      }
      res.write(
        `data: ${JSON.stringify({
          id,
          object: 'chat.completion.chunk',
          created,
          model,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
          },
        })}\n\n`,
      );
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    return json(res, 200, {
      id,
      object: 'chat.completion',
      created,
      model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: answer },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
    });
  }

  json(res, 404, {
    error: { message: `no stub route for ${req.method} ${url.pathname}` },
  });
});

server.listen(PORT, '127.0.0.1', () => {
  log(`listening on http://127.0.0.1:${PORT} (dims=${DIMS})`);
});
