'use client';

import type { DiagnosticCheck } from '@ragenai/rag-core/document-diagnostics';
import { useTranslations } from 'next-intl';

export type DiagnosticCopy = { label: string; advice: string };

/**
 * The words for each check, written out one literal key at a time.
 *
 * Not `t(`${check}-label`)`: `i18n-keys-exist-in-both-locales.test.ts` can
 * only verify a key it can read, and a template literal would let a check
 * added to `DIAGNOSTIC_CHECKS` render as its raw key in Polish without any
 * test noticing. The `Record` makes a missing check a type error instead.
 */
export function useDiagnosticCopy(): Record<DiagnosticCheck, DiagnosticCopy> {
  const t = useTranslations('document-diagnostics');
  return {
    markup: { label: t('markup-label'), advice: t('markup-advice') },
    'table-without-header': {
      label: t('table-without-header-label'),
      advice: t('table-without-header-advice'),
    },
    'fallback-parser': {
      label: t('fallback-parser-label'),
      advice: t('fallback-parser-advice'),
    },
    'empty-chunks': {
      label: t('empty-chunks-label'),
      advice: t('empty-chunks-advice'),
    },
    'few-section-paths': {
      label: t('few-section-paths-label'),
      advice: t('few-section-paths-advice'),
    },
    'over-budget': {
      label: t('over-budget-label'),
      advice: t('over-budget-advice'),
    },
    'overlap-duplication': {
      label: t('overlap-duplication-label'),
      advice: t('overlap-duplication-advice'),
    },
  };
}
