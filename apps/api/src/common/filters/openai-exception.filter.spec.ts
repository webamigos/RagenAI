/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  HttpException,
} from '@nestjs/common';
import { OpenAiExceptionFilter } from './openai-exception.filter.js';
import { RagenWebError } from '../services/ragen-web.client.js';

describe('OpenAiExceptionFilter', () => {
  let filter: OpenAiExceptionFilter;

  function mockHost(res: Record<string, jest.Mock>) {
    return {
      switchToHttp: () => ({
        getResponse: () => res,
      }),
    } as never;
  }

  function createMockRes() {
    const res: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  }

  beforeEach(() => {
    filter = new OpenAiExceptionFilter();
  });

  it('translates BadRequestException to invalid_request_error', () => {
    const res = createMockRes();
    filter.catch(new BadRequestException('missing field'), mockHost(res));

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        message: 'missing field',
        type: 'invalid_request_error',
        code: 400,
        param: null,
      },
    });
  });

  it('translates UnauthorizedException to authentication_error', () => {
    const res = createMockRes();
    filter.catch(new UnauthorizedException(), mockHost(res));

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].error.type).toBe('authentication_error');
  });

  it('translates NotFoundException to not_found_error', () => {
    const res = createMockRes();
    filter.catch(new NotFoundException('gone'), mockHost(res));

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].error.type).toBe('not_found_error');
  });

  it('translates RagenWebError with upstream status + parsed body', () => {
    const res = createMockRes();
    filter.catch(
      new RagenWebError(
        400,
        JSON.stringify({ error: 'bad prompt', code: 'E_PROMPT' }),
      ),
      mockHost(res),
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0]).toEqual({
      error: {
        message: 'bad prompt',
        type: 'invalid_request_error',
        code: 'E_PROMPT',
        param: null,
      },
    });
  });

  it('parses OpenAI-shaped upstream body ({ error: { message, code } })', () => {
    const res = createMockRes();
    filter.catch(
      new RagenWebError(
        400,
        JSON.stringify({
          error: {
            message: 'prompt too long',
            type: 'invalid_request_error',
            code: 'context_length_exceeded',
          },
        }),
      ),
      mockHost(res),
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0]).toEqual({
      error: {
        message: 'prompt too long',
        type: 'invalid_request_error',
        code: 'context_length_exceeded',
        param: null,
      },
    });
  });

  it('falls back to upstream body text when JSON parse fails', () => {
    const res = createMockRes();
    filter.catch(
      new RagenWebError(500, 'Internal Server Error'),
      mockHost(res),
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].error.message).toBe(
      'Internal Server Error',
    );
    expect(res.json.mock.calls[0][0].error.type).toBe('api_error');
  });

  it('handles validation error arrays from NestJS ValidationPipe', () => {
    const res = createMockRes();
    const exc = new HttpException(
      { message: ['field A invalid', 'field B required'] },
      400,
    );
    filter.catch(exc, mockHost(res));

    expect(res.json.mock.calls[0][0].error.message).toBe(
      'field A invalid; field B required',
    );
  });

  it('returns 500 internal_error for unknown exceptions', () => {
    const res = createMockRes();
    filter.catch(new Error('something broke'), mockHost(res));

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0]).toEqual({
      error: {
        message: 'Internal server error',
        type: 'internal_error',
        code: null,
        param: null,
      },
    });
  });
});
