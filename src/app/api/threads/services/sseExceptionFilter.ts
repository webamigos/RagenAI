import {
  ChainError,
  LLMApiError,
  UnknownChainError,
} from '@/libs/chains/errors';
import { SseMessageError } from '@/app/contracts/Events';
import { TextEncoder } from 'util';
import { setSentryContext } from '@/app/lib/services/sentry';
import { prepareSseMessage } from '@/libs/sse/prepare-sse-message';

export class SseExceptionFilter {
  private encoder = new TextEncoder();

  private prepareSseMessage(event: string, data: any): string {
    return prepareSseMessage(event, data);
  }

  handleError(error: any, controller: ReadableStreamDefaultController) {
    let chainError: ChainError;

    if (error instanceof ChainError) {
      chainError = error;
    } else if (error?.status) {
      chainError = new LLMApiError(
        'LLM API request failed',
        `${error?.message}`
      );
    } else {
      chainError = new UnknownChainError();
    }

    const errorMessage: SseMessageError = {
      type: 'error',
      message: chainError.message,
      code: chainError.code,
      originalErrorMessage: chainError.originalErrorMessage,
    };

    setSentryContext('CHAIN_SSE_ERROR', {
      errorMessage,
    });
    controller.enqueue(
      this.encoder.encode(this.prepareSseMessage('error', errorMessage))
    );
    controller.close();
  }
}
