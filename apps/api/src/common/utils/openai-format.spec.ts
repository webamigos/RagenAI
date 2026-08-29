import {
  buildChatCompletion,
  buildChatCompletionChunk,
  buildError,
  buildList,
  chatCompletionId,
  encodeSseData,
  fileId,
  nowUnixSeconds,
  SSE_DONE,
  stripPrefix,
} from './openai-format.js';

describe('openai-format', () => {
  it('chatCompletionId produces chatcmpl-<alnum24>', () => {
    const id = chatCompletionId();
    expect(id).toMatch(/^chatcmpl-[a-f0-9]{24}$/);
  });

  it('nowUnixSeconds is seconds, not ms', () => {
    const t = nowUnixSeconds();
    expect(t).toBeGreaterThan(1_700_000_000); // after Nov 2023
    expect(t).toBeLessThan(2_000_000_000); // before May 2033
    expect(Number.isInteger(t)).toBe(true);
  });

  it('fileId prefixes publicId', () => {
    expect(fileId('abc-123')).toBe('file-abc-123');
  });

  it('stripPrefix removes the prefix only when present', () => {
    expect(stripPrefix('file-abc', 'file')).toBe('abc');
    expect(stripPrefix('abc', 'file')).toBe('abc'); // no-op when missing
  });

  it('buildChatCompletion produces the OpenAI shape', () => {
    const c = buildChatCompletion({
      model: 'gpt-5.4',
      content: 'Hello',
      usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
    });
    expect(c).toMatchObject({
      object: 'chat.completion',
      model: 'gpt-5.4',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hello' },
          finish_reason: 'stop',
          logprobs: null,
        },
      ],
      usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
    });
    expect(c.id).toMatch(/^chatcmpl-/);
    expect(typeof c.created).toBe('number');
  });

  it('buildChatCompletionChunk omits finish_reason by default', () => {
    const chunk = buildChatCompletionChunk({
      id: 'chatcmpl-xxx',
      model: 'gpt-5.4',
      delta: { content: 'He' },
    });
    expect(chunk).toMatchObject({
      id: 'chatcmpl-xxx',
      object: 'chat.completion.chunk',
      choices: [
        {
          index: 0,
          delta: { content: 'He' },
          finish_reason: null,
        },
      ],
    });
  });

  it('buildChatCompletionChunk can carry usage on final chunk', () => {
    const chunk = buildChatCompletionChunk({
      id: 'chatcmpl-xxx',
      model: 'gpt-5.4',
      delta: {},
      finishReason: 'stop',
      usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
    });
    expect(chunk.choices[0].finish_reason).toBe('stop');
    expect(chunk.usage).toEqual({
      prompt_tokens: 3,
      completion_tokens: 1,
      total_tokens: 4,
    });
  });

  it('buildList wraps array in { object: "list", data }', () => {
    expect(buildList([{ id: 'a' }, { id: 'b' }])).toEqual({
      object: 'list',
      data: [{ id: 'a' }, { id: 'b' }],
    });
  });

  it('buildError produces the OpenAI error envelope', () => {
    const e = buildError({
      message: 'bad request',
      type: 'invalid_request_error',
      code: 400,
    });
    expect(e).toEqual({
      error: {
        message: 'bad request',
        type: 'invalid_request_error',
        code: 400,
        param: null,
      },
    });
  });

  it('encodeSseData emits `data: <json>\\n\\n`', () => {
    expect(encodeSseData({ foo: 1 })).toBe('data: {"foo":1}\n\n');
  });

  it('SSE_DONE is the terminator line', () => {
    expect(SSE_DONE).toBe('data: [DONE]\n\n');
  });
});
