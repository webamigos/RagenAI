/**
 * Phase 4 — ingest-time text sanitizer.
 *
 * Runs on text-like content fetched into the knowledge base (URL
 * scrapes via Firecrawl, and any worker-side parse once this module
 * is mirrored to `ragen-worker`). Three distinct jobs:
 *
 * 1. **Normalize visible content**
 *    - Unicode NFKC normalization collapses visually-identical but
 *      technically-different codepoints (fullwidth → halfwidth,
 *      compatibility characters, etc.) so the LLM can't be confused
 *      by homoglyph tricks.
 *
 * 2. **Strip invisible payloads**
 *    - Zero-width characters (`\u200B`–`\u200F`, `\uFEFF`, `\u2060`)
 *      are invisible in most renderers but still read by the LLM.
 *      Attackers hide directives in them.
 *    - ASCII control chars (except TAB/LF/CR) appear in PDFs extracted
 *      carelessly and have no legitimate use in chat context.
 *    - HTML comments (`<!-- ... -->`) are invisible in rendered pages
 *      but ship straight into the model. Classic hiding place for
 *      injected instructions.
 *
 * 3. **Detect suspicious patterns (flag but do not mutate)**
 *    - Regex set matches common prompt-injection indicators: "ignore
 *      (all )?previous", "system:", "</system>", "you are now",
 *      "new instructions", etc.
 *    - Important: this step DOES NOT remove the matched text. An
 *      attacker document that literally contains those phrases as
 *      quoted examples (a security article, for instance) should
 *      still be ingestable. We just flag the file so admins can
 *      review it and so the KB UI surfaces a warning badge.
 *
 * The detection pass is intentionally high-recall / moderate-precision.
 * False positives are fine because the only consequence is a warning
 * badge — the file is still searchable and usable. False negatives
 * matter more (a real injection that slips past).
 *
 * Defensive behaviour
 * -------------------
 * - Never throws. Null/undefined/empty input returns
 *   `{ sanitized: '', suspicious: false, patterns: [] }` so callers
 *   don't need try/catch.
 * - The `patterns` array contains only the pattern *labels* (not the
 *   matched text) so the audit metadata never leaks sensitive content.
 */

export type SanitizeResult = {
  /** Cleaned text with invisible payloads removed. */
  sanitized: string;
  /** True if any suspicious pattern matched. */
  suspicious: boolean;
  /**
   * Labels of matched suspicious patterns, deduplicated. Safe to log
   * in audit metadata — contains no raw content.
   */
  patterns: string[];
};

// Zero-width + directional-formatting characters that render invisibly
// in most browsers but still influence LLM interpretation.
const ZERO_WIDTH_PATTERN = /[\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]/g;

// ASCII control chars except \t \n \r. These have no legitimate use
// in ingested text and sometimes carry in from messy PDF parsers.
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

// HTML comments (non-greedy, DOTALL). Firecrawl's `onlyMainContent: true`
// usually strips these but we defend anyway — the option is a best-effort
// from the upstream and we don't want to rely on it for security.
const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/g;

/**
 * Suspicious-content detectors. Each entry has a short label used in
 * audit metadata and a regex matched case-insensitively. Labels are
 * stable; do not rename them without updating downstream dashboards.
 */
const SUSPICIOUS_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  {
    label: 'ignore-previous',
    regex: /\bignore\s+(all\s+)?(previous|prior|above)\b/i,
  },
  {
    label: 'disregard-prior',
    regex: /\bdisregard\s+(all\s+)?(previous|prior|above)\b/i,
  },
  { label: 'system-tag', regex: /<\s*\/?\s*system\s*>/i },
  { label: 'system-prefix', regex: /(^|[\n.!?])\s*system\s*:\s*/i },
  { label: 'new-instructions', regex: /\bnew\s+instructions?\b/i },
  { label: 'role-override', regex: /\byou\s+are\s+now\s+(a|an|the)\b/i },
  {
    label: 'forget-prior',
    regex: /\bforget\s+(all\s+)?(previous|prior|your)\b/i,
  },
  {
    label: 'override-prompt',
    regex:
      /\boverride\s+(the\s+)?(system|prior|previous)\s*(prompt|instructions?)\b/i,
  },
  { label: 'jailbreak-dan', regex: /\bDAN\b[\s\S]{0,40}\bmode\b/i },
  {
    label: 'prompt-exfil',
    regex: /\b(print|show|reveal|output)\s+(your|the)\s+system\s+prompt\b/i,
  },
];

export function sanitizeIngestedText(input: unknown): SanitizeResult {
  if (typeof input !== 'string' || input.length === 0) {
    return { sanitized: '', suspicious: false, patterns: [] };
  }

  try {
    // Pass 1: strip invisible chars + comments BEFORE running detection.
    // If we detected against the raw input, an attacker could hide an
    // "ignore previous instructions" directive behind a zero-width
    // char and evade the detector. Strip first, detect on clean text.
    const stripped = input
      .replace(ZERO_WIDTH_PATTERN, '')
      .replace(CONTROL_CHAR_PATTERN, '')
      .replace(HTML_COMMENT_PATTERN, '');

    // Pass 2: Unicode NFKC. Collapse compatibility variants so
    // homoglyph-based evasions (fullwidth characters, etc.) normalize
    // into their canonical form and the detectors match them.
    const normalized = stripped.normalize('NFKC');

    // Pass 3: suspicious-pattern detection against the fully cleaned
    // text. Collect labels only — never include raw matched text in
    // the result so audit logs can't leak attacker-planted content.
    const matched = new Set<string>();
    for (const { label, regex } of SUSPICIOUS_PATTERNS) {
      if (regex.test(normalized)) {
        matched.add(label);
      }
    }

    return {
      sanitized: normalized,
      suspicious: matched.size > 0,
      patterns: Array.from(matched),
    };
  } catch {
    // Any runtime error in the sanitizer must not break ingestion,
    // but we FLAG the content as suspicious — a crafted input that
    // trips the regex engine or normalization is itself an anomaly
    // worth admin review. Attempt a minimal strip so the stored
    // content at least has the invisible characters removed; if
    // even that fails, fall back to the raw string.
    const raw = String(input);
    try {
      const minimal = raw
        .replace(ZERO_WIDTH_PATTERN, '')
        .replace(CONTROL_CHAR_PATTERN, '');
      return {
        sanitized: minimal,
        suspicious: true,
        patterns: ['sanitizer-error'],
      };
    } catch {
      return {
        sanitized: raw,
        suspicious: true,
        patterns: ['sanitizer-error'],
      };
    }
  }
}
