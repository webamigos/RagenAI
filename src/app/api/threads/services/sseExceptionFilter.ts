import {
  ChainError,
  LLMApiError,
  UnknownChainError,
} from '@/libs/chains/errors';
import { SseMessageError } from '@/app/contracts/Events';
import { TextEncoder } from 'util';
import { setSentryContext } from '@/app/lib/services/sentry';

export class SseExceptionFilter {
  private encoder = new TextEncoder();

  private prepareSseMessage(event: string, data: any): string {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
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

    setSentryContext('EXTRA_DATA', {
      errorMessage,
    });
    controller.enqueue(
      this.encoder.encode(this.prepareSseMessage('error', errorMessage))
    );
    controller.close();
  }
}
