/**
 * Turns a `.env.example` template into a working `.env.local` by replacing
 * only the `KEY=` lines named in `values`, leaving every comment, blank line
 * and untouched default exactly as the cloned repo shipped it. Matches both
 * commented (`# KEY=`) and uncommented (`KEY=...`) lines, so a generated
 * secret also uncomments a line that started out disabled.
 *
 * `missingKeys` reports any requested key that never matched a line in the
 * template — surfaced to the user rather than silently dropped, since it
 * usually means the manifest and the cloned repo's `.env.example` have
 * drifted.
 */

const ENV_LINE = /^#?\s*([A-Z][A-Z0-9_]*)=/;

export interface ApplyEnvOverridesResult {
  content: string;
  missingKeys: string[];
}

export function applyEnvOverrides(
  template: string,
  values: Record<string, string>,
): ApplyEnvOverridesResult {
  const remaining = new Set(Object.keys(values));

  const lines = template.split('\n').map((line) => {
    const key = ENV_LINE.exec(line)?.[1];
    if (!key || !(key in values)) {
      return line;
    }
    remaining.delete(key);
    return `${key}=${values[key]}`;
  });

  return { content: lines.join('\n'), missingKeys: [...remaining] };
}
