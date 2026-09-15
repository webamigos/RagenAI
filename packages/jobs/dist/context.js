'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.JobFailure = void 0;
/**
 * A failure a handler raises itself.
 *
 * `nonRetryable` is the distinction that has to survive the port: an
 * unsupported file type must not be retried five times, and each engine spells
 * that differently — `ApplicationFailure.nonRetryable` on one side,
 * `UnrecoverableError` on the other. Handlers throw this and the adapters
 * translate, so a handler never imports an engine's error class.
 */
class JobFailure extends Error {
  retryable;
  type;
  constructor(message, options) {
    super(
      message,
      options?.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = 'JobFailure';
    this.retryable = options?.retryable ?? true;
    this.type = options?.type;
  }
  static nonRetryable(message, options) {
    return new JobFailure(message, { ...options, retryable: false });
  }
}
exports.JobFailure = JobFailure;
//# sourceMappingURL=context.js.map
