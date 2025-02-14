import {
  ChainError,
  LLMApiError,
  UnknownChainError,
} from '@/libs/chains/errors';
import { SseMessageError } from '@/app/contracts/Events';
import { setSentryContext } from '@/app/lib/services/sentry';
import { sendApiEvent } from '@/libs/sse/prepare-sse-message';

export class SseExceptionFilter {
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
    sendApiEvent(controller, 'error', errorMessage);

    controller.close();
  }
}
