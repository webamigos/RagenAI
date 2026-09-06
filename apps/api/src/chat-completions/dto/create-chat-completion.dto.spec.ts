import { type BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateChatCompletionDto } from './create-chat-completion.dto.js';

/**
 * These assertions are about the *pipe*, not the class. `main.ts` runs
 * with `forbidNonWhitelisted`, which turns any undeclared property into
 * a 400 — so the DTO's field list is the real OpenAI-compatibility
 * contract, and a field dropped from it breaks callers silently at the
 * edge rather than in any unit under test.
 */
describe('CreateChatCompletionDto under the global validation pipe', () => {
  // Mirrors useGlobalPipes() in main.ts. Kept in sync by hand; that's
  // the point of the test — the pipe config is what callers hit.
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata = {
    type: 'body' as const,
    metatype: CreateChatCompletionDto,
  };

  const minimal = {
    assistant_id: 'asst-abc',
    messages: [{ role: 'user', content: 'Hi' }],
  };

  const validate = (body: Record<string, unknown>): Promise<unknown> =>
    pipe.transform(body, metadata);

  /**
   * The thrown `BadRequestException`'s `message` is the constant "Bad
   * Request Exception" — the per-field detail lives in the response
   * payload, which is also what the caller actually receives. Assert on
   * that, or a regex matches the boilerplate and the test proves nothing.
   */
  const rejectionDetail = async (
    body: Record<string, unknown>,
  ): Promise<string> => {
    try {
      await validate(body);
    } catch (err) {
      const response = (err as BadRequestException).getResponse();
      const detail =
        typeof response === 'string'
          ? response
          : (response as { message?: string | string[] }).message;
      return Array.isArray(detail) ? detail.join('; ') : String(detail);
    }
    throw new Error('expected the pipe to reject this body, but it passed');
  };

  it('accepts the minimal Ragen body', async () => {
    await expect(validate(minimal)).resolves.toMatchObject({
      assistant_id: 'asst-abc',
      messages: [{ role: 'user', content: 'Hi' }],
    });
  });

  // The regression this suite exists for: every one of these was a 400
  // before the params were declared, so an OpenAI SDK call carrying any
  // of them failed against an "OpenAI-compatible" endpoint.
  describe.each([
    ['top_p', 0.9],
    ['n', 1],
    ['stop', ['\n\n']],
    ['presence_penalty', 0.5],
    ['frequency_penalty', -0.5],
    ['logit_bias', { '1234': -100 }],
    ['user', 'user-42'],
    ['seed', 7],
    ['logprobs', false],
    ['top_logprobs', 5],
    ['store', true],
    ['metadata', { run: 'nightly' }],
    ['parallel_tool_calls', true],
    ['service_tier', 'auto'],
    ['reasoning_effort', 'high'],
    ['max_completion_tokens', 512],
  ])('accepts the OpenAI param %s', (field, value) => {
    it('validates', async () => {
      await expect(validate({ ...minimal, [field]: value })).resolves.toEqual(
        expect.objectContaining({ [field]: value }),
      );
    });
  });

  it('accepts a per-message name', async () => {
    await expect(
      validate({
        ...minimal,
        messages: [{ role: 'user', content: 'Hi', name: 'patryk' }],
      }),
    ).resolves.toMatchObject({
      messages: [{ role: 'user', content: 'Hi', name: 'patryk' }],
    });
  });

  it('accepts a whole OpenAI-shaped payload at once', async () => {
    await expect(
      validate({
        ...minimal,
        model: 'gpt-5.4',
        temperature: 0.2,
        top_p: 0.95,
        max_completion_tokens: 1024,
        n: 1,
        stream: true,
        stream_options: { include_usage: true },
        presence_penalty: 0,
        frequency_penalty: 0,
        seed: 1,
        user: 'u1',
      }),
    ).resolves.toBeDefined();
  });

  // Loud-failure cases. Accepting these and then ignoring them would
  // hand the caller a response that silently violates what they asked
  // for, which is worse than a 400 naming the field.
  describe.each([
    ['response_format', { type: 'json_object' }],
    ['tools', [{ type: 'function', function: { name: 'f' } }]],
    ['tool_choice', 'auto'],
  ])('still rejects %s rather than ignoring it', (field, value) => {
    it('rejects, naming the field', async () => {
      await expect(
        rejectionDetail({ ...minimal, [field]: value }),
      ).resolves.toContain(field);
    });
  });

  it('rejects n > 1 instead of returning a single choice', async () => {
    await expect(rejectionDetail({ ...minimal, n: 3 })).resolves.toContain(
      'n ',
    );
  });

  it('still rejects genuinely unknown fields', async () => {
    await expect(
      rejectionDetail({ ...minimal, definitely_not_openai: true }),
    ).resolves.toContain('definitely_not_openai');
  });

  it('still enforces the documented ranges', async () => {
    await expect(
      rejectionDetail({ ...minimal, temperature: 5 }),
    ).resolves.toContain('temperature');
    await expect(rejectionDetail({ ...minimal, top_p: 2 })).resolves.toContain(
      'top_p',
    );
    await expect(
      rejectionDetail({ ...minimal, reasoning_effort: 'extreme' }),
    ).resolves.toContain('reasoning_effort');
  });

  it('still requires assistant_id and a non-empty messages array', async () => {
    await expect(
      rejectionDetail({ messages: [{ role: 'user', content: 'Hi' }] }),
    ).resolves.toContain('assistant_id');
    await expect(
      rejectionDetail({ assistant_id: 'asst-abc', messages: [] }),
    ).resolves.toContain('messages');
  });
});
