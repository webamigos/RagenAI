/** The source order is the citation order stored by extraction, never sorted by file. */
export type AlignedClaim<T> = {
  claim: string;
  citations: { marker: number; source: T | null }[];
};
export function alignClaimsToSources<T>(
  content: string,
  sources: readonly T[],
): AlignedClaim<T>[] {
  const lines = content.split('\n');
  const separator = lines.lastIndexOf('---');
  const head = separator < 0 ? lines : lines.slice(0, separator);
  const first = head.findIndex((line) => /^\s*[-*+]\s+/.test(line));
  const claims: string[] = [];
  let current = '';
  const flush = () => {
    if (current.trim()) {
      claims.push(current.trim());
    }
    current = '';
  };
  for (const line of first < 0 ? head : head.slice(first)) {
    const trimmed = line.trim();
    if (!trimmed || /^#{1,6}\s/.test(trimmed)) {
      flush();
      continue;
    }
    const bullet = /^[-*+]\s+(.+)$/.exec(trimmed);
    if (bullet) {
      flush();
      current = bullet[1]!;
    } else {
      current += `${current ? ' ' : ''}${trimmed}`;
    }
  }
  flush();
  return claims.map((text) => {
    const markers = [
      ...new Set(
        [...text.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1])),
      ),
    ];
    return {
      claim: text.replace(/\[\d+\]/g, '').trim(),
      citations: markers.map((marker) => ({
        marker,
        source: sources[marker - 1] ?? null,
      })),
    };
  });
}

// A deliberately narrow heuristic: missing facts are a prompt to read, never a verdict.
const NUMBERS = /\d+(?:[ \u00a0]\d{3})*(?:[.,]\d+)*(?:[-/]\d+)*/g;
const NEGATION =
  /(?<![\p{L}\p{N}_])(?:nie|bez|nigdy|no|not|never|without|cannot|can't)(?![\p{L}\p{N}_])/giu;
const CURRENCY = /\b(?:PLN|EUR|USD|GBP)\b|zł|[€$£]/giu;
const normalizeNumber = (value: string) =>
  value.replace(/[ \u00a0]/g, '').replace(/,/g, '.');
export function missingQuoteFacts(claim: string, quote: string): string[] {
  const numbers = new Set(
    [...claim.matchAll(NUMBERS)].map((m) => normalizeNumber(m[0])),
  );
  const missing = [...quote.matchAll(NUMBERS)]
    .map((m) => m[0])
    .filter((n) => !numbers.has(normalizeNumber(n)));
  const claimNegations = new Set(
    [...claim.matchAll(NEGATION)].map((m) => m[0].toLowerCase()),
  );
  for (const match of quote.matchAll(NEGATION)) {
    if (!claimNegations.has(match[0].toLowerCase())) {
      missing.push(match[0].toLowerCase());
    }
  }
  const currencies = new Set(
    [...claim.matchAll(CURRENCY)].map((match) => match[0].toUpperCase()),
  );
  for (const match of quote.matchAll(CURRENCY)) {
    if (!currencies.has(match[0].toUpperCase())) {
      missing.push(match[0]);
    }
  }
  return [...new Set(missing)];
}
