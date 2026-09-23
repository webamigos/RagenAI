import type { KnowledgePageType } from '@ragenai/brain-contracts';

import { slugify } from '../text';
import { expandToSentence } from './verify-quotes';

/** A markdown table in the source: `source.slice(start, end)`. */
export type TableBlock = {
  start: number;
  end: number;
  /** The nearest heading above the table, without its `#`s; null if none. */
  heading: string | null;
  /** The first sentence of prose between that heading and the table. */
  lead: string | null;
};

/**
 * Every markdown table in a text — a run of lines that start with `|`, as
 * Docling writes them — with the heading and prose that introduce it.
 */
export function findTables(source: string): TableBlock[] {
  const tables: TableBlock[] = [];
  const lines = source.split('\n');
  let offset = 0;
  let heading: { text: string; end: number } | null = null;
  let current: { start: number; end: number } | null = null;

  const close = () => {
    if (current) {
      tables.push({
        ...current,
        heading: heading?.text ?? null,
        lead: heading ? leadOf(source, heading.end, current.start) : null,
      });
      current = null;
    }
  };

  for (const line of lines) {
    const end = offset + line.length;
    if (/^\s*\|/.test(line)) {
      if (current) {
        current.end = end;
      } else {
        current = { start: offset, end };
      }
    } else {
      close();
      const match = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
      if (match) {
        heading = { text: match[1]!, end };
      }
    }
    offset = end + 1;
  }
  close();
  return tables;
}

/** A data row of a table: the line as written, and where it starts. */
export type TableRow = {
  text: string;
  at: number;
  end: number;
  statement: string;
};

/**
 * A table's data rows — after the header and the separator — each with a
 * statement built from the table's own column names: "Kod usługi: SR-201;
 * Nazwa usługi: Toczenie CNC; …". The header is the document's words, so the
 * statement is in the document's language without a model writing it.
 */
export function tableRows(source: string, table: TableBlock): TableRow[] {
  const cells = (line: string) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());
  const lines: { text: string; at: number }[] = [];
  let at = table.start;
  for (const line of source.slice(table.start, table.end).split('\n')) {
    lines.push({ text: line, at });
    at += line.length + 1;
  }
  if (lines.length < 3 || !/^\s*\|[\s|:-]+\|?\s*$/.test(lines[1]!.text)) {
    return [];
  }
  const header = cells(lines[0]!.text);
  return lines.slice(2).flatMap(({ text, at: rowAt }) => {
    if (text.trim() === '') {
      return [];
    }
    const values = cells(text);
    const statement = values
      .map((value, i) => (header[i] ? `${header[i]}: ${value}` : value))
      .filter((part) => part.trim() !== '')
      .join('; ');
    return [
      { text: text.trim(), at: rowAt, end: rowAt + text.length, statement },
    ];
  });
}

/** The first sentence of the prose in `[from, to)`, verbatim, or null. */
function leadOf(source: string, from: number, to: number): string | null {
  const between = source.slice(from, to);
  const first = between.search(/\S/);
  if (first === -1) {
    return null;
  }
  const at = from + first;
  if (/^[|#]/.test(source.slice(at))) {
    return null;
  }
  const sentence = expandToSentence(source, { start: at, end: at + 1 }, 600);
  return sentence === null ? null : sentence.replace(/\s+/g, ' ').trim();
}

/** What `consolidateTableRows` needs of a draft page. */
export type TableDraft<C extends { at: number }> = {
  slug: string;
  title: string;
  type: KnowledgePageType;
  description: string;
  claims: C[];
};

/**
 * Fold entities that are only rows of one table back into the table.
 *
 * The prompt says a table is one entity and its rows are claims. The model
 * follows it most of the time and not always: on the price list in
 * `tabele-bilingual-v1`, one run in two made each of fifty rows its own
 * entity — 39 candidate pages with one claim each, joined by guessed edges.
 * Same shape as the short quotes of B5, and settled the same way: after the
 * answer, deterministically, rather than by a prompt that has to win.
 *
 * The rule is the prompt's own exception, checked against the text: **a
 * draft whose every verified claim sits inside one table is a row**, not a
 * subject — the document says nothing about it outside the table. A draft
 * with a claim anywhere else is described in prose and stays its own page.
 * When two or more drafts are rows of the same table, they become one:
 *
 * - into the draft whose slug is the table's heading, when the model made
 *   one from the prose — that is the entity the table is about;
 * - else into the row-draft holding most of the table's claims (two at
 *   least, and more than half), which is the model having done it right
 *   and added a stray row or two — a row-draft with one claim is a row
 *   however few rows there are;
 * - else into a page named by the heading, described by the first sentence
 *   of the prose above the table (verbatim, so in the document's language),
 *   typed by the rows' most common type.
 *
 * With `completion`, a folded table's data rows that no claim cites are
 * added as claims — the row verbatim as the quote, its cells under the
 * table's own column names as the statement. Only for a folded table: that
 * is where rows go missing, and a table the model used only in part on
 * purpose (one row of a revision history) is not one it split.
 *
 * Claims keep their source order. `renamed` maps every folded slug to the
 * slug it went into, so edges can follow.
 */
export function consolidateTableRows<C extends { at: number; cited: string }>(
  drafts: ReadonlyArray<TableDraft<C>>,
  tables: ReadonlyArray<TableBlock>,
  completion?: {
    source: string;
    /** A claim for a row the model did not return. */
    claimFor: (row: TableRow) => C;
  },
): {
  drafts: TableDraft<C>[];
  renamed: Map<string, string>;
  folded: number;
  completed: number;
} {
  const inside = (claim: C, t: TableBlock) =>
    claim.at >= t.start && claim.at < t.end;
  const renamed = new Map<string, string>();
  let result = drafts.map((d) => ({ ...d, claims: [...d.claims] }));
  let folded = 0;
  let completed = 0;

  for (const table of tables) {
    const rows = result.filter(
      (d) => d.claims.length > 0 && d.claims.every((c) => inside(c, table)),
    );
    if (rows.length < 2) {
      continue;
    }
    const tableClaims = rows.reduce((n, d) => n + d.claims.length, 0);
    const headingSlug = table.heading ? slugify(table.heading) : null;

    let target =
      result.find((d) => headingSlug !== null && d.slug === headingSlug) ??
      rows.find(
        (d) => d.claims.length >= 2 && d.claims.length * 2 > tableClaims,
      ) ??
      null;
    if (!target) {
      const title = table.heading ?? rows[0]!.title;
      target = {
        slug: slugify(title),
        title,
        type: mostCommonType(rows),
        description: table.lead ?? title,
        claims: [],
      };
      result.push(target);
    }

    const cited = new Set(target.claims.map((c) => c.cited));
    for (const row of rows) {
      if (row === target) {
        continue;
      }
      for (const claim of row.claims) {
        if (!cited.has(claim.cited)) {
          cited.add(claim.cited);
          target.claims.push(claim);
        }
      }
      renamed.set(row.slug, target.slug);
      folded += 1;
    }
    if (completion) {
      // A split table loses rows: the model that makes a page of every row
      // stops part-way (39 of 54 claims on the price list it was measured
      // on). Folding cannot bring back what it never returned; the table
      // itself can.
      for (const row of tableRows(completion.source, table)) {
        const covered = target.claims.some(
          (c) => c.at >= row.at && c.at < row.end,
        );
        if (!covered) {
          target.claims.push(completion.claimFor(row));
          completed += 1;
        }
      }
    }
    target.claims.sort((a, b) => a.at - b.at);
    const gone = new Set(rows.filter((d) => d !== target));
    result = result.filter((d) => !gone.has(d));
  }

  // A slug folded into one that was itself folded later follows the chain.
  for (const [from, to] of renamed) {
    let end = to;
    while (renamed.has(end) && renamed.get(end) !== end) {
      end = renamed.get(end)!;
    }
    renamed.set(from, end);
  }
  return { drafts: result, renamed, folded, completed };
}

function mostCommonType(
  drafts: ReadonlyArray<{ type: KnowledgePageType }>,
): KnowledgePageType {
  const counts = new Map<KnowledgePageType, number>();
  for (const d of drafts) {
    counts.set(d.type, (counts.get(d.type) ?? 0) + 1);
  }
  let best = drafts[0]!.type;
  for (const [type, count] of counts) {
    if (count > counts.get(best)!) {
      best = type;
    }
  }
  return best;
}
