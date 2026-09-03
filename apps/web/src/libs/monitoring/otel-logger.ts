/**
 * apps/web's OTel logs bridge. The implementation is shared — see ADR-28; this
 * only fixes the instrumentation scope name.
 */
import { createOtelLogger } from '@ragenai/observability';

export const otelLogger = createOtelLogger('ragen-web');
