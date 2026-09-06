/**
 * apps/mcp's tracer. Built by the shared factory from ADR-28 so the
 * instrumentation scope is derived the same way here as in apps/api and
 * apps/worker.
 */
import { createTelemetry } from '@ragenai/observability';

import { DEFAULT_SERVICE_NAME } from './service-name.js';

const telemetry = createTelemetry(DEFAULT_SERVICE_NAME);

export const tracer = telemetry.tracer;
