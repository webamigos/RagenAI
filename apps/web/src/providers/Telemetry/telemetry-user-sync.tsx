'use client';

import { useEffect } from 'react';
import {
  setOtelUserContext,
  clearOtelUserContext,
} from '@/libs/monitoring/otel-user-context';

interface TelemetryUserSyncProps {
  userId: string | null;
  orgId: string | null;
}

export function TelemetryUserSync({ userId, orgId }: TelemetryUserSyncProps) {
  useEffect(() => {
    if (userId) {
      setOtelUserContext({
        userId,
        orgId: orgId ?? undefined,
      });
    } else {
      clearOtelUserContext();
    }
  }, [userId, orgId]);

  return null;
}
