import { readFileSync } from 'node:fs';

/**
 * A row of the guardrail first-pass set, once a person has labelled it.
 *
 * `apps/web/evals/datasets/guardrail-first-pass/README.md` is the source for
 * the fields. Only labelled rows are read: a run over a row with no label
 * would measure agreement with the model that wrote its draft, which is the
 * one thing the set exists not to do.
 */
export type Label = 'benign' | 'attack';
export type RowSet = 'benign' | 'attack' | 'other-language';
export type RowLang = 'pl' | 'en' | 'de' | 'uk';

export type LabelledRow = {
  readonly id: string;
  readonly set: RowSet;
  readonly lang: RowLang;
  readonly text: string;
  readonly label: Label;
};

const SETS: readonly RowSet[] = ['benign', 'attack', 'other-language'];
const LANGS: readonly RowLang[] = ['pl', 'en', 'de', 'uk'];
const LABELS: readonly Label[] = ['benign', 'attack'];

export class DatasetError extends Error {}

/**
 * Parse a JSONL split. Refuses, rather than skips, anything that is not a
 * labelled row: a set quietly shrunk by twenty rows reports a rate over the
 * rows that happened to parse.
 */
export function parseLabelledSet(jsonl: string): LabelledRow[] {
  const rows: LabelledRow[] = [];
  const texts = new Set<string>();
  const lines = jsonl.split('\n');

  lines.forEach((line, index) => {
    if (line.trim() === '') {
      return;
    }
    const where = `line ${index + 1}`;
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(line) as Record<string, unknown>;
    } catch {
      throw new DatasetError(`${where}: not JSON`);
    }
    const { set, lang, text, label } = raw;
    if (!SETS.includes(set as RowSet)) {
      throw new DatasetError(`${where}: unknown set ${String(set)}`);
    }
    if (!LANGS.includes(lang as RowLang)) {
      throw new DatasetError(`${where}: unknown lang ${String(lang)}`);
    }
    if (typeof text !== 'string' || text.trim() === '') {
      throw new DatasetError(`${where}: empty text`);
    }
    if (!LABELS.includes(label as Label)) {
      throw new DatasetError(
        `${where}: label is ${JSON.stringify(label)}; a person labels every row before anything runs`,
      );
    }
    if (texts.has(text)) {
      throw new DatasetError(`${where}: duplicate text`);
    }
    texts.add(text);
    rows.push({
      id: typeof raw.id === 'string' ? raw.id : `row-${index + 1}`,
      set: set as RowSet,
      lang: lang as RowLang,
      text,
      label: label as Label,
    });
  });

  if (rows.length === 0) {
    throw new DatasetError('the set is empty');
  }
  return rows;
}

export function loadLabelledSet(path: string): LabelledRow[] {
  return parseLabelledSet(readFileSync(path, 'utf8'));
}
