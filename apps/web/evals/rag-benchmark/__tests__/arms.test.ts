import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGenerateText, mockNativeChatInstance } = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
  mockNativeChatInstance: vi.fn(() => ({ id: 'model-instance' })),
}));

vi.mock('ai', () => ({ generateText: mockGenerateText }));

vi.mock('@/libs/llm/native-models', () => ({
  nativeChatInstance: mockNativeChatInstance,
}));

import { askControl, parseRagStream } from '../lib/arms';

describe('parseRagStream', () => {
  it('concatenates the content deltas in order', () => {
    const raw = [
      'data: {"content":"Zwrot wynosi "}',
      '',
      'data: {"content":"87%."}',
      '',
    ].join('\n');
    expect(parseRagStream(raw).text).toBe('Zwrot wynosi 87%.');
  });

  it('picks up the citations frame', () => {
    const raw = [
      'data: {"content":"87%"}',
      '',
      'event: citations',
      'data: {"fileIds":["file-a","file-b"]}',
      '',
    ].join('\n');
    const parsed = parseRagStream(raw);
    expect(parsed.text).toBe('87%');
    expect(parsed.citedFileIds).toEqual(['file-a', 'file-b']);
  });

  // Heartbeats and control frames are expected on this stream; one of them
  // must not cost the whole answer.
  it('ignores non-JSON frames', () => {
    const raw = ['data: ping', '', 'data: {"content":"ok"}', ''].join('\n');
    expect(parseRagStream(raw).text).toBe('ok');
  });

  it('returns an empty answer for an empty stream rather than throwing', () => {
    expect(parseRagStream('')).toEqual({ text: '', citedFileIds: [] });
  });
});

/**
 * The control arm posted `/v1/chat/completions` at `LITELLM_PROXY_URL` until
 * B6 removed the proxy, so it had been calling nothing. These assert the path,
 * not the answer: a control that reaches a different upstream from the RAG arm
 * makes the two columns incomparable, and a control that reaches none makes
 * the benchmark produce no number at all.
 */
describe('askControl', () => {
  beforeEach(() => {
    mockGenerateText
      .mockReset()
      .mockResolvedValue({ text: 'a control answer' });
    mockNativeChatInstance.mockClear();
  });

  it('resolves the model through the gateway the product uses', async () => {
    await askControl({ model: 'gemini-3-flash-preview', question: 'Ile?' });

    expect(mockNativeChatInstance).toHaveBeenCalledWith({
      model: 'gemini-3-flash-preview',
      temperature: 0,
    });
  });

  it('asks the question with no system prompt, so the control gets no help', async () => {
    await askControl({ model: 'gemini-3-flash-preview', question: 'Ile?' });

    const call = mockGenerateText.mock.calls[0][0] as Record<string, unknown>;
    expect(call.prompt).toBe('Ile?');
    expect(call.system).toBeUndefined();
  });

  it('returns the generated text', async () => {
    mockGenerateText.mockResolvedValue({ text: '87%' });

    await expect(
      askControl({ model: 'gemini-3-flash-preview', question: 'Ile?' }),
    ).resolves.toBe('87%');
  });

  it('carries a deadline, so a stalled call fails into the retry instead of hanging the run', async () => {
    await askControl({ model: 'gemini-3-flash-preview', question: 'Ile?' });

    const call = mockGenerateText.mock.calls[0][0] as Record<string, unknown>;
    expect(call.abortSignal).toBeInstanceOf(AbortSignal);
  });
});
