/**
 * Phase 4 — ingest-time text sanitizer (ragen-worker mirror).
 *
 * This file is a byte-for-byte copy of
 * `ragen-app/src/libs/ingest/sanitize.ts`. The function is pure over
 * string input with zero runtime dependencies, so both repos can ship
 * their own copy without sharing a package. Keep the two files in
 * sync — any pattern added or renamed in one must be mirrored in the
 * other so the audit-log `patterns` labels remain stable across
 * producers. If you find yourself wanting to diverge, extract to a
 * shared package instead of drifting.
 *
 * Three jobs:
 *
 * 1. **Normalize visible content**
 *    - Unicode NFKC collapses visually-identical but technically-
 *      different codepoints so the LLM can't be confused by
 *      homoglyph tricks.
 *
 * 2. **Strip invisible payloads**
 *    - Zero-width characters (`\u200B`–`\u200F`, `\uFEFF`, `\u2060`)
 *      are invisible but still read by the LLM.
 *    - ASCII control chars (except TAB/LF/CR) have no legitimate
 *      use in chat context.
 *    - HTML comments are invisible in rendered pages but ship
 *      straight into the model. Classic hiding place for injected
 *      instructions.
 *
 * 3. **Detect suspicious patterns (flag but do not mutate)**
 *    - The file stays ingestable; the `suspicious` flag and the
 *      `patterns` labels feed the audit log and the KB UI warning
 *      badge.
 *
 * Never throws. On any runtime error the catch block marks the
 * content suspicious (because a crash input is itself an anomaly
 * worth admin review), applies a minimal best-effort strip, and
 * returns.
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

const ZERO_WIDTH_PATTERN = /[\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]/g;

const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/g;

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
    // Strip invisible characters and comments FIRST so the detection
    // pass runs on clean text. An attacker hiding "ignore previous"
    // behind zero-width chars would otherwise evade the detector.
    const stripped = input
      .replace(ZERO_WIDTH_PATTERN, '')
      .replace(CONTROL_CHAR_PATTERN, '')
      .replace(HTML_COMMENT_PATTERN, '');

    // NFKC collapses compatibility variants so homoglyph-based
    // evasions normalize into their canonical form.
    const normalized = stripped.normalize('NFKC');

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
    // A crash input is itself an anomaly — flag it as suspicious so
    // the audit log captures the edge case for admin review.
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
