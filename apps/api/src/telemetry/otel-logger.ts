/**
 * apps/api's OTel logs bridge. Implementation shared via ADR-28.
 */
import { createOtelLogger } from '@ragenai/observability';

export const otelLogger = createOtelLogger('ragen-api');
