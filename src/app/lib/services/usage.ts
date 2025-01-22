import db from '@ragenai/prisma-client';
import { UsageTracker } from '../utils/usage/usage-tracker';
import { UsageMetricsCore } from '../utils/usage/usage-metrics-core';

const metricsCore = UsageMetricsCore.getInstance(db);
export const usageTracker = new UsageTracker(metricsCore);
