import type { SpanProcessor, ReadableSpan } from '@opentelemetry/sdk-trace-web';
import type { Span, Context } from '@opentelemetry/api';

interface UserContext {
  userId?: string;
  orgId?: string;
}

let currentUserContext: UserContext = {};

export function setOtelUserContext(ctx: UserContext) {
  currentUserContext = { ...ctx };
}

export function clearOtelUserContext() {
  currentUserContext = {};
}

export class UserContextSpanProcessor implements SpanProcessor {
  onStart(span: Span, _parentContext: Context): void {
    if (currentUserContext.userId) {
      span.setAttribute('user.id', currentUserContext.userId);
    }
    if (currentUserContext.orgId) {
      span.setAttribute('org.id', currentUserContext.orgId);
    }
  }

  onEnd(_span: ReadableSpan): void {}

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}
