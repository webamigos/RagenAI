'use client';

import { useTranslations } from 'next-intl';

import { relationKindLabel } from '@/features/brain/utils/relation-kind';

/**
 * A relation's kind in the reader's language, for client components whose own
 * translations live in another namespace. Server ones call relationKindLabel
 * with their `brain` translator.
 */
export function RelationKind({ kind }: { kind: string }) {
  const t = useTranslations('brain');
  return <>{relationKindLabel(kind, t)}</>;
}
