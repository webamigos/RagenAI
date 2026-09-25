import type { KnowledgePageStatus } from '../contracts/brain.types';

/**
 * A page's status as a badge: approved reads as ready, a candidate or a stale
 * page as waiting on someone, a rejected one as neutral. The badge always
 * carries the status's word — the tint is a second signal, never the only
 * one (docs/panel-ux-rules.md, rule 27).
 */
export function pageStatusVariant(
  status: KnowledgePageStatus,
): 'ready' | 'pending' | 'secondary' {
  if (status === 'APPROVED') {
    return 'ready';
  }
  if (status === 'CANDIDATE' || status === 'STALE') {
    return 'pending';
  }
  return 'secondary';
}
