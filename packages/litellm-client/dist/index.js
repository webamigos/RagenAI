'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.createRetry =
  exports.NOOP_LOGGER =
  exports.createLiteLLMClient =
    void 0;
/**
 * The LiteLLM proxy admin client.
 *
 * One implementation for apps/web, apps/api and apps/admin. See ADR-34 for why
 * two hand-maintained copies and a pair of open-coded `fetch`es became this.
 */
var client_1 = require('./client');
Object.defineProperty(exports, 'createLiteLLMClient', {
  enumerable: true,
  get: function () {
    return client_1.createLiteLLMClient;
  },
});
var logger_1 = require('./logger');
Object.defineProperty(exports, 'NOOP_LOGGER', {
  enumerable: true,
  get: function () {
    return logger_1.NOOP_LOGGER;
  },
});
var retry_1 = require('./retry');
Object.defineProperty(exports, 'createRetry', {
  enumerable: true,
  get: function () {
    return retry_1.createRetry;
  },
});
//# sourceMappingURL=index.js.map
