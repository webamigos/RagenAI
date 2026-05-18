export const NIP_RE = /^\d{10}$/;
export const KRS_RE = /^\d{1,10}$/;

export type LookupHint = { nip?: string; krs?: string; name?: string };

export function detectLookup(data: Record<string, unknown>): LookupHint | null {
  const stringValue = (k: string): string | undefined => {
    const v = data[k];
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  };

  const candidateKeys = Object.keys(data).filter((k) => !k.startsWith('_enrichment_'));

  const findByLabel = (...needles: string[]): string | undefined => {
    const lowered = candidateKeys.map((k) => [k, k.toLowerCase()] as const);
    // Prefer exact match
    for (const needle of needles) {
      for (const [key, lower] of lowered) {
        if (lower === needle) {
          const value = stringValue(key);
          if (value) {
            return value;
          }
        }
      }
    }
    // Fall back to substring
    for (const [key, lower] of lowered) {
      if (needles.some((n) => lower.includes(n))) {
        const value = stringValue(key);
        if (value) {
          return value;
        }
      }
    }
    return undefined;
  };

  const nipRaw = findByLabel('nip');
  if (nipRaw) {
    const nip = nipRaw.replace(/[\s-]/g, '');
    if (NIP_RE.test(nip)) {
      return { nip };
    }
  }

  const krsRaw = findByLabel('krs');
  if (krsRaw) {
    const krs = krsRaw.replace(/[\s-]/g, '');
    if (KRS_RE.test(krs)) {
      return { krs };
    }
  }

  const company = findByLabel('company', 'firma', 'nazwa', 'organization');
  if (company) {
    return { name: company };
  }

  return null;
}
