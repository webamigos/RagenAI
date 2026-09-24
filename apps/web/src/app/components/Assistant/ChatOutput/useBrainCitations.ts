'use client';

import { useEffect, useState } from 'react';

import { getBrainCitationsAction } from '@/app/actions/brain-citations';
import type { BrainCitations } from '@/features/brain/contracts/brain-citations.types';

/**
 * The Brain pages among a turn's sources (spec E8), looked up once per set
 * of file ids. Read when rendered rather than stored with the message, so a
 * page withdrawn or re-scoped since is shown as it is now — a live turn and a
 * reopened thread end in the same call. Off (`enabled: false`) where sources
 * cannot be opened anyway: a public share, a guest thread.
 */
export function useBrainCitations(
  fileIds: string[],
  enabled: boolean,
): BrainCitations {
  const [citations, setCitations] = useState<BrainCitations>({});
  const key = [...new Set(fileIds)].sort().join(',');

  useEffect(() => {
    if (!enabled || key === '') {
      return;
    }
    let cancelled = false;
    getBrainCitationsAction(key.split(','))
      .then((found) => {
        if (!cancelled) {
          setCitations(found);
        }
      })
      .catch(() => {
        // A decoration: the source list stands without it.
      });
    return () => {
      cancelled = true;
    };
  }, [key, enabled]);

  return enabled ? citations : {};
}
