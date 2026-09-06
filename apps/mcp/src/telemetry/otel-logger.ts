/**
 * apps/mcp's OTel logs bridge. Implementation shared via ADR-28.
 */
import { createOtelLogger } from '@ragenai/observability';

import { DEFAULT_SERVICE_NAME } from './service-name.js';

export const otelLogger = createOtelLogger(DEFAULT_SERVICE_NAME);
