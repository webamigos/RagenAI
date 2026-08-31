import { z } from 'zod';

import { logger } from '../../logger';

/**
 * Zod schema for the structured PDF extraction output (ADR-18).
 *
 * Claude is prompted to return a JSON object with a `sections` array where
 * each element describes a heading level, title, and the body content under
 * that heading. The schema deliberately stays loose: title and content are
 * plain strings (not further validated) and level is constrained to 1-6.
 * Any deviation from this shape causes the parser to return null and the
 * caller to fall back to the legacy flat-text extraction.
 */
export const pdfSectionSchema = z.object({
  level: z.number().int().min(1).max(6),
  title: z.string(),
  content: z.string(),
});

export const pdfSectionsOutputSchema = z.object({
  sections: z.array(pdfSectionSchema),
});

export type PdfSection = z.infer<typeof pdfSectionSchema>;
export type PdfSectionsOutput = z.infer<typeof pdfSectionsOutputSchema>;

/**
 * Strip common wrappers Claude may add around the JSON payload even when the
 * prompt asks for bare JSON. Handles:
 *   - \`\`\`json ... \`\`\` code fences (with or without language tag)
 *   - Leading/trailing whitespace and blank lines
 *   - Leading BOM / invisible characters
 *
 * Exported for testability.
 */
export function stripJsonWrapper(raw: string): string {
  let text = raw.replace(/^\uFEFF/, '').trim();

  // Code fence with language tag: ```json ... ``` or ```JSON ...```
  const fenceMatch = text.match(/^```(?:json|JSON)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  // Naked backticks wrapper (no language): ``` ... ```
  if (text.startsWith('```') && text.endsWith('```')) {
    let inner = text.slice(3, -3);
    // Strip leading language tag if present (e.g., "json" or "JSON")
    inner = inner.replace(/^(?:json|JSON)\s*/, '');
    text = inner.trim();
  }

  return text;
}

/**
 * Parse Claude's structured PDF extraction response into a validated section
 * array. Returns `null` on any failure so the caller can fall back to the
 * legacy flat-text path.
 *
 * Failure modes that return null:
 *   - Empty or whitespace-only input
 *   - Response is not valid JSON after wrapper-stripping
 *   - JSON does not match pdfSectionsOutputSchema (missing keys, wrong
 *     types, out-of-range level, etc.)
 *   - Parsed sections array is empty (nothing to index — same as a
 *     content-less extraction)
 *
 * All failures are logged at `warn` with a short reason and a small
 * snippet of the raw output for debugging, but they never throw.
 */
export function parseStructuredPdfOutput(
  raw: string,
): PdfSectionsOutput | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const unwrapped = stripJsonWrapper(trimmed);

  let parsed: unknown;
  try {
    parsed = JSON.parse(unwrapped);
  } catch (err) {
    logger.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        snippet: unwrapped.slice(0, 200),
      },
      'Structured PDF extraction: JSON.parse failed, falling back to flat text',
    );
    return null;
  }

  const validation = pdfSectionsOutputSchema.safeParse(parsed);
  if (!validation.success) {
    logger.warn(
      {
        issues: validation.error.issues.slice(0, 5),
      },
      'Structured PDF extraction: schema validation failed, falling back to flat text',
    );
    return null;
  }

  if (validation.data.sections.length === 0) {
    logger.warn(
      'Structured PDF extraction: empty sections array, falling back to flat text',
    );
    return null;
  }

  return validation.data;
}

/**
 * Render a heading stack as a human-readable section path. Mirrors the DOCX
 * splitter's format for consistency across file types: `"H1 > H2 > H3"`.
 *
 * - Returns `undefined` when the stack contains no non-empty titles (e.g.
 *   a top-level section with empty title) — the caller writes the chunk
 *   without a `sectionPath` in that case, matching the DOCX behavior.
 * - Skips empty titles while rendering so gaps in the hierarchy (an h3
 *   under no h2, or a section with empty title below real headings) render
 *   cleanly without stray `>` separators.
 */
export function renderPdfSectionPath(
  stack: (string | null)[],
): string | undefined {
  const filtered = stack.filter(
    (title): title is string => title !== null && title.trim().length > 0,
  );
  if (filtered.length === 0) {
    return undefined;
  }
  return filtered.map((t) => t.trim()).join(' > ');
}

/**
 * Build the heading stack required for a section by level. The caller
 * maintains a running stack as it walks the sections array in order; when
 * a new section appears at `level`, any deeper slots are dropped, missing
 * shallower slots are filled with `null`, and the new title occupies
 * `stack[level - 1]`.
 *
 * Mutates and returns `stack` for ergonomic use inside a walk.
 */
export function updateHeadingStack(
  stack: (string | null)[],
  section: PdfSection,
): (string | null)[] {
  const levelIdx = section.level - 1;
  // Drop deeper levels
  while (stack.length > levelIdx) {
    stack.pop();
  }
  // Fill missing shallower slots with null so sectionPath renders cleanly
  while (stack.length < levelIdx) {
    stack.push(null);
  }
  stack.push(section.title);
  return stack;
}
