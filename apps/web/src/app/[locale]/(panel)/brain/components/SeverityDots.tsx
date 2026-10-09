'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { KnowledgeFindingListItem } from '@/features/brain/contracts/brain.types';

const FILLED: Record<KnowledgeFindingListItem['severity'], number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

/**
 * A finding's severity as one to three filled dots, named in a tooltip and to
 * a screen reader. A bare "Niska" beside the type badge read as a second
 * label; the dots read as a level, and their count carries it without colour.
 */
export function SeverityDots({
  severity,
  name,
}: {
  severity: KnowledgeFindingListItem['severity'];
  /** "Ważność: Niska" — given by the server list that renders this. */
  name: string;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="img"
            tabIndex={0}
            aria-label={name}
            data-testid="finding-severity"
            className="inline-flex items-center gap-0.5 rounded-sm px-1 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                aria-hidden="true"
                className={`size-1.5 rounded-full border border-muted-foreground ${
                  n <= (FILLED[severity] ?? 0) ? 'bg-muted-foreground' : ''
                }`}
              />
            ))}
          </span>
        </TooltipTrigger>
        <TooltipContent>{name}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
