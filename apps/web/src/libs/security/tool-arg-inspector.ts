/**
 * Phase 3 — tool-argument exfiltration inspector.
 *
 * The attack vector: a poisoned KB document convinces the LLM to call a
 * write tool with arguments that contain exfiltrated data — API keys,
 * JWTs, long encoded blobs, etc. Phase 2 confirms the user wants to
 * call the tool, but the user has no way to tell whether the *arguments*
 * were influenced by prompt injection. This inspector runs between
 * argument sanitization and the MCP server call, looks for exfil
 * signals, and blocks or flags high-risk calls.
 *
 * Weighted scoring, not a single threshold: we want to let mildly
 * suspicious things through (and audit them) while hard-blocking the
 * unambiguous cases (literal API keys in args).
 *
 * Signal weights
 * --------------
 *   secretPattern    5   "Bearer xyz", "sk-...", "eyJ..." JWT, AKIA/ASIA, PEM
 *   longBase64       3   >= 256 chars matching base64 charset
 *   highEntropy      2   >= 512 chars with Shannon entropy > 4.5
 *
 * Risk bands
 * ----------
 *   total >= 5 → high   → block (return error result, audit event fires)
 *   total >= 2 → medium → audit event fires, call proceeds
 *   total 0    → low    → pass through silently
 *
 * Design principles
 * -----------------
 * - Recursive walk: nested objects and arrays are fully inspected.
 *   Attackers will hide payloads in nested fields.
 * - Field names are preserved in signal paths so audit logs show
 *   WHERE the match was, not just WHAT.
 * - Defensive: catches exceptions internally, never throws back to
 *   the MCP client. A bug in the inspector must not break tool calls.
 */

export type RiskBand = 'low' | 'medium' | 'high';

export type InspectionSignal = {
  type: 'secretPattern' | 'longBase64' | 'highEntropy';
  path: string;
  weight: number;
  /** Short description suitable for audit log metadata. No raw content. */
  detail: string;
};

export type InspectionResult = {
  risk: RiskBand;
  score: number;
  signals: InspectionSignal[];
};

const HIGH_THRESHOLD = 5;
const MEDIUM_THRESHOLD = 2;

const BASE64_MIN_LENGTH = 256;
const ENTROPY_MIN_LENGTH = 512;
const ENTROPY_THRESHOLD = 4.5;

/**
 * Secret markers. Each pattern has a short label used in the audit
 * metadata so admins can triage matches without seeing raw values.
 */
const SECRET_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: 'bearer-token', regex: /\bBearer\s+[A-Za-z0-9._\-+/=]{16,}/ },
  { label: 'openai-key', regex: /\bsk-[A-Za-z0-9]{20,}/ },
  { label: 'anthropic-key', regex: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  // JWT-like: three base64url sections separated by dots, starting with eyJ
  {
    label: 'jwt',
    regex: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  },
  { label: 'aws-access-key', regex: /\b(AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { label: 'pem-block', regex: /-----BEGIN[ A-Z]+-----/ },
  { label: 'github-token', regex: /\bghp_[A-Za-z0-9]{36}\b/ },
  { label: 'slack-token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
];

// Base64 characters only, possibly with = padding at the end. We check
// the whole match is base64 by construction; length bound is enforced
// in the caller.
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
// Fast-reject: if the string doesn't look base64-ish at all, skip the
// full match. This is a crude prefilter to avoid O(n) regex work on
// every string. Requires that ≥ 85% of chars are base64 alphabet.
function looksLikeBase64(s: string): boolean {
  if (s.length < BASE64_MIN_LENGTH) {
    return false;
  }
  let b64Chars = 0;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    const isAlpha =
      (c >= 48 && c <= 57) || // 0-9
      (c >= 65 && c <= 90) || // A-Z
      (c >= 97 && c <= 122) || // a-z
      c === 43 || // +
      c === 47 || // /
      c === 61; // =
    if (isAlpha) {
      b64Chars += 1;
    }
  }
  return b64Chars / s.length > 0.85;
}

/**
 * Shannon entropy (bits per character) over the string's byte
 * distribution. Used to detect "looks like ciphertext / random data"
 * rather than natural language. English prose scores ~4.0; base64
 * and random binary score > 5.0.
 */
function shannonEntropy(s: string): number {
  if (s.length === 0) {
    return 0;
  }
  const freq = new Map<number, number>();
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    freq.set(c, (freq.get(c) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / s.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function detectSecretPattern(value: string): string | null {
  for (const { label, regex } of SECRET_PATTERNS) {
    if (regex.test(value)) {
      return label;
    }
  }
  return null;
}

/**
 * Inspect one string value and produce any signals it triggers. Does
 * NOT short-circuit — a single value can trigger multiple signals
 * (e.g. a long base64 blob that also matches a secret pattern).
 */
function inspectString(value: string, path: string): InspectionSignal[] {
  const signals: InspectionSignal[] = [];

  const secretLabel = detectSecretPattern(value);
  if (secretLabel) {
    signals.push({
      type: 'secretPattern',
      path,
      weight: 5,
      detail: `matched ${secretLabel} pattern`,
    });
  }

  // Strip whitespace before base64/entropy checks — real base64 blobs
  // are typically single-line but attackers might pad with newlines.
  const compact = value.replace(/\s+/g, '');
  if (compact.length >= BASE64_MIN_LENGTH && looksLikeBase64(compact)) {
    // Confirm with the strict pattern on the compact form.
    if (BASE64_PATTERN.test(compact)) {
      signals.push({
        type: 'longBase64',
        path,
        weight: 3,
        detail: `${compact.length} chars of base64`,
      });
    }
  }

  if (compact.length >= ENTROPY_MIN_LENGTH) {
    const entropy = shannonEntropy(compact);
    if (entropy > ENTROPY_THRESHOLD) {
      signals.push({
        type: 'highEntropy',
        path,
        weight: 2,
        detail: `${compact.length} chars, entropy=${entropy.toFixed(2)}`,
      });
    }
  }

  return signals;
}

/**
 * Walk a tool-argument object recursively and collect signals from
 * every string leaf. Field names are joined with dots to produce a
 * human-readable `path` for the audit trail.
 *
 * Array indices appear as `[i]` in the path — e.g. `attendees[2].email`.
 */
function walkArgs(
  value: unknown,
  path: string,
  signals: InspectionSignal[],
): void {
  if (typeof value === 'string') {
    signals.push(...inspectString(value, path));
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      walkArgs(value[i], `${path}[${i}]`, signals);
    }
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      walkArgs(child, path ? `${path}.${key}` : key, signals);
    }
  }
  // Numbers, booleans, null, undefined — nothing to inspect.
}

/**
 * Public entry point. Never throws — a bug in the inspector must not
 * break tool execution. Errors result in `risk: 'low', signals: []`
 * so the call proceeds as if inspection didn't run.
 */
export function inspectToolArgs(args: unknown): InspectionResult {
  try {
    const signals: InspectionSignal[] = [];
    walkArgs(args, '', signals);
    const score = signals.reduce((sum, s) => sum + s.weight, 0);
    let risk: RiskBand;
    if (score >= HIGH_THRESHOLD) {
      risk = 'high';
    } else if (score >= MEDIUM_THRESHOLD) {
      risk = 'medium';
    } else {
      risk = 'low';
    }
    return { risk, score, signals };
  } catch {
    return { risk: 'low', score: 0, signals: [] };
  }
}
