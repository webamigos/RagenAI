import type { GoDecision, Fit, Summary } from './fit';

export type WordingResult = {
  readonly wording: string;
  readonly fit: Fit;
  readonly summary: Summary;
};

export type RunHeader = {
  readonly date: string;
  readonly setPath: string;
  readonly split: 'tuning' | 'holdout';
  readonly servedModel: { name: string; mode: string } | null;
  readonly judgeModel: string;
  readonly ruleThreshold: number;
};

const pct = (n: number, of: number) =>
  of === 0 ? '—' : `${((n / of) * 100).toFixed(1)} % (${n}/${of})`;
const ms = (v: number | null) => (v === null ? '—' : `${Math.round(v)} ms`);
const oneLine = (text: string) => text.replace(/\s+/g, ' ').slice(0, 160);

export function renderReport(
  header: RunHeader,
  results: readonly WordingResult[],
  decision?: GoDecision,
): string {
  const lines: string[] = [
    `# Guardrail first pass — ${header.split} run, ${header.date}`,
    '',
    'Step A3/A4 of `docs/specs/2026-10-13-typed-decisions-on-basal.md`.',
    '',
    `- set: \`${header.setPath}\``,
    `- basal served model: ${
      header.servedModel
        ? `\`${header.servedModel.name}\` on \`${header.servedModel.mode}\``
        : '**unknown** (GET /v1/models failed or reported no mode)'
    }`,
    `- judge: \`${header.judgeModel}\`, rule threshold ${header.ruleThreshold}`,
    '',
  ];

  if (decision) {
    lines.push(
      `## A4: ${decision.go ? '**go**' : '**no-go**'}`,
      '',
      ...(decision.reasons.length === 0
        ? ['Every condition in the spec holds.']
        : decision.reasons.map((r) => `- ${r}`)),
      '',
    );
  }

  lines.push(
    '## Wordings',
    '',
    '| wording | fitted max P(attack) | benign cleared | false clearances | other-language cleared | basal p50 / p95 | judge p50 / p95 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const { wording, fit, summary: s } of results) {
    lines.push(
      `| \`${wording}\` | ${fit.clearMax === null ? `none: ${fit.reason}` : fit.clearMax.toFixed(4)} | ${pct(
        s.benignCleared,
        s.benign,
      )} | ${s.falseClearances.length} | ${s.otherLanguageCleared.length} | ${ms(
        s.basalMs.p50,
      )} / ${ms(s.basalMs.p95)} | ${ms(s.judgeMs.p50)} / ${ms(s.judgeMs.p95)} |`,
    );
  }
  lines.push('');

  for (const { wording, summary: s } of results) {
    lines.push(`### \`${wording}\``, '');
    lines.push(
      `- gated by language: ${
        Object.entries(s.gatedByLang)
          .map(([lang, n]) => `${lang} ${n}`)
          .join(', ') || 'none'
      }`,
      `- judge against the labels: ${s.judge.missedAttacks} attack(s) missed, ${s.judge.flaggedBenign} benign row(s) flagged`,
      `- through \`runPolicyRules\` at the production timeout: ${
        Object.entries(s.outcomes)
          .map(([outcome, n]) => `${outcome} ${n}`)
          .join(', ') || 'not run'
      }`,
      `- rows the \`runPolicyRules\` arm and the direct measurement disagree on: ${s.armDisagreements}`,
      '',
    );
    if (s.falseClearances.length > 0) {
      lines.push('**False clearances:**', '');
      for (const m of s.falseClearances) {
        lines.push(
          `- \`${m.row.id}\` (${m.row.lang}, P(attack) ${m.pAttack?.toFixed(4)}): ${oneLine(m.row.text)}`,
        );
      }
      lines.push('');
    }
    if (s.otherLanguageCleared.length > 0) {
      lines.push(
        '**Other-language rows cleared (the gate let them through):**',
        '',
      );
      for (const m of s.otherLanguageCleared) {
        lines.push(`- \`${m.row.id}\` (${m.row.lang}): ${oneLine(m.row.text)}`);
      }
      lines.push('');
    }
  }

  lines.push(
    '## Still to add by hand',
    '',
    '- the judge’s own latency per turn, read from existing traces, and whether it is on the critical path to the first token.',
    '',
  );
  return lines.join('\n');
}
