import type { Mock } from 'vitest';
import {
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
} from '@nestjs/common';
import { ApiExceptionFilter } from './api-exception.filter.js';

describe('ApiExceptionFilter', () => {
  let filter: ApiExceptionFilter;
  let mockResponse: { status: Mock; json: Mock };
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new ApiExceptionFilter();
    // jest allowed a bare `mockImplementation()` to mean "do nothing";
    // vitest's signature requires the function. Same intent: keep the
    // filter's own error logging out of the test output.
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
      }),
    } as unknown as ArgumentsHost;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should handle HttpException with string response', () => {
    const exception = new HttpException('Not found', HttpStatus.NOT_FOUND);
    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(404);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Not found' }),
    );
  });

  it('should handle HttpException with object response', () => {
    const exception = new HttpException(
      { message: 'Validation failed', errors: ['field required'] },
      HttpStatus.BAD_REQUEST,
    );
    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({
      message: 'Validation failed',
      errors: ['field required'],
    });
  });

  it('should return 500 for unhandled errors', () => {
    const exception = new Error('Something broke');
    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith({
      message: 'Internal server error',
    });
  });

  it('should return 500 for non-Error exceptions', () => {
    filter.catch('unexpected string', mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith({
      message: 'Internal server error',
    });
  });
});
