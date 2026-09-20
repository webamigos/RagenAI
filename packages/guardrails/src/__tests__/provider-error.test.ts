import { describe, expect, it } from 'vitest';

import {
  describeProviderError,
  JudgeTimeoutError,
  providerErrorReason,
} from '../evaluator/provider-error';

/**
 * Nothing about a failed provider call reaches a log except its shape.
 *
 * The fixture below is the real thing: the AI SDK's `APICallError` carries
 * `requestBodyValues`, and for a guardrail that body is the system prompt plus
 * the customer's message. Pino's default serializer copies every enumerable
 * property of an error, so `logger.warn({ err }, '…')` wrote the message to
 * the log in plain text — in a feature whose whole design is that it does not.
 *
 * The test therefore asserts over the *serialized* output rather than over
 * field names. A field-by-field assertion passes the moment a provider adds a
 * property nobody thought of, which is exactly how this arrived.
 */

/** An `APICallError`, reconstructed without importing a provider SDK. */
function apiCallError(): Error {
  const err = new Error('Bad Request');
  err.name = 'APICallError';
  return Object.assign(err, {
    url: 'https://generativelanguage.googleapis.com/v1beta/models/x',
    requestBodyValues: {
      system: 'You are a policy compliance classifier.',
      messages: [
        {
          role: 'user',
          content:
            'Policy:\n---\nNever discuss pricing.\n---\n\n' +
            'Message:\n---\nmy password is hunter2\n---',
        },
      ],
    },
    statusCode: 400,
    responseBody:
      '{"error":{"message":"the request was: my password is hunter2"}}',
    isRetryable: false,
  });
}

const SECRETS = ['hunter2', 'Never discuss pricing', 'policy compliance'];

describe('describeProviderError', () => {
  it('carries nothing from the request body', () => {
    const serialized = JSON.stringify(describeProviderError(apiCallError()));

    for (const secret of SECRETS) {
      expect(
        serialized,
        `"${secret}" survived into something that gets logged. The customer's ` +
          'message is in the thread, where its owner can see it and the ' +
          'platform cannot — not in a log line nobody reads until something ' +
          'is already wrong.',
      ).not.toContain(secret);
    }
  });

  it('carries no message, stack, body or url', () => {
    // Named individually as well, because the assertion above only catches a
    // leak whose content this test happened to imagine. These four are the
    // known carriers: a stack's first line is `Name: message`, and a
    // provider's message is the provider's to choose.
    const described = describeProviderError(apiCallError()) as Record<
      string,
      unknown
    >;

    expect(Object.keys(described).sort()).toEqual(['statusCode', 'type']);
  });

  it('keeps enough to tell the failures apart', () => {
    // The point is not to log nothing. 401 is credentials, 429 is a rate
    // limit, 400 is a bad request — an operator can act on each, and none of
    // them needs the prompt.
    expect(describeProviderError(apiCallError())).toEqual({
      type: 'APICallError',
      statusCode: 400,
    });
  });

  it('reads the OpenAI SDK’s spelling of a status too', () => {
    // `statusCode` is the AI SDK's, `status` the OpenAI SDK's, and guardrails
    // call both — a judge model and a moderation endpoint.
    const err = Object.assign(new Error('rate limited'), {
      name: 'RateLimitError',
      status: 429,
      code: 'rate_limit_exceeded',
    });

    expect(describeProviderError(err)).toEqual({
      type: 'RateLimitError',
      statusCode: 429,
      code: 'rate_limit_exceeded',
    });
  });

  it('refuses a name or code that is free text rather than an identifier', () => {
    // `name` and `code` are both writable. A provider that put a sentence in
    // either would put that sentence straight into the log this function
    // exists to keep clean — and a sentence from a provider is a sentence
    // that may quote the request.
    const err = Object.assign(new Error('x'), {
      name: 'Error while sending "my password is hunter2" upstream',
      code: 'failed on input: hunter2',
    });

    const described = describeProviderError(err);

    expect(JSON.stringify(described)).not.toContain('hunter2');
    expect(described.code).toBeUndefined();
  });

  it('refuses a status that is not one', () => {
    for (const status of [0, 99, 600, 1.5, '400', null]) {
      expect(
        describeProviderError(Object.assign(new Error('x'), { status })),
      ).not.toHaveProperty('statusCode');
    }
  });

  it('survives a thrown value that is not an error at all', () => {
    // `throw 'string'` and `throw undefined` are both legal, and a helper on
    // the failure path that throws its own TypeError turns a degraded
    // guardrail into a broken turn.
    expect(describeProviderError('boom')).toEqual({ type: 'string' });
    expect(describeProviderError(undefined)).toEqual({ type: 'undefined' });
    expect(describeProviderError(null)).toEqual({ type: 'object' });
  });
});

describe('the timeout stays legible', () => {
  it('is distinguishable once the message is gone', () => {
    // `new Error('judge timed out')` reduces to `{ type: 'Error' }`, which is
    // indistinguishable from any other failure — and the timeout is the one
    // failure that is ours rather than the provider's. A class survives the
    // reduction; a message does not.
    expect(describeProviderError(new JudgeTimeoutError())).toEqual({
      type: 'JudgeTimeoutError',
    });
    expect(providerErrorReason(new JudgeTimeoutError())).toBe(
      'JudgeTimeoutError',
    );
  });
});

describe('providerErrorReason', () => {
  it('is a short identifier, and carries nothing from the body', () => {
    // This one is the `reason` that reaches `onJudgeError` and then a log. It
    // used to be `err.message.slice(0, 120)` — which bounded the leak at 120
    // characters rather than closing it.
    const reason = providerErrorReason(apiCallError());

    expect(reason).toBe('APICallError:400');
    for (const secret of SECRETS) {
      expect(reason).not.toContain(secret);
    }
  });
});
