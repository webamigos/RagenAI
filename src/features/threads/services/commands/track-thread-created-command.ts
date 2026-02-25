'use server';

import { usageTracker } from '@/app/lib/services/usage';

export const trackThreadCreatedCommand = async () => {
  usageTracker.incThreadsCount();
};
