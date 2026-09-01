import {
  ChainError,
  LLMApiError,
  UnknownChainError,
} from '@/libs/chains/errors';
import { type SseMessageError } from '@/features/threads/contracts/events.types';
import { sendApiEvent } from '@/libs/sse/prepare-sse-message';

export class SseExceptionFilter {
  handleError(error: any, controller: ReadableStreamDefaultController) {
    let chainError: ChainError;

    if (error instanceof ChainError) {
      chainError = error;
    } else if (error?.status) {
      chainError = new LLMApiError(
        'LLM API request failed',
        `${error?.message}`,
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

    sendApiEvent(controller, 'error', errorMessage);

    controller.close();
  }
}
