import { readFileSync } from 'node:fs';
import { join, isAbsolute, resolve } from 'node:path';
import type { Corpus, Question, QuestionType } from './types';

/**
 * A corpus is a directory holding `corpus.json`, `questions.json` and the
 * documents themselves. Nothing about the runner is specific to the corpus
 * shipped here — point `--corpus` at your own directory and the same numbers
 * come out for your documents.
 */
export interface LoadedCorpus {
  dir: string;
  corpus: Corpus;
  questions: Question[];
}

export function resolveCorpusDir(arg: string, cwd: string): string {
  return isAbsolute(arg) ? arg : resolve(cwd, arg);
}

export function loadCorpus(dir: string): LoadedCorpus {
  const corpus = JSON.parse(
    readFileSync(join(dir, 'corpus.json'), 'utf8'),
  ) as Corpus;
  const { questions } = JSON.parse(
    readFileSync(join(dir, 'questions.json'), 'utf8'),
  ) as { questions: Question[] };

  const problems = validateCorpus(corpus, questions);
  if (problems.length > 0) {
    throw new Error(
      `Corpus at ${dir} is not usable:\n  - ${problems.join('\n  - ')}`,
    );
  }
  return { dir, corpus, questions };
}

/**
 * Fail loudly on the mistakes that otherwise produce a plausible-looking but
 * meaningless report: a duplicate question id (two rows collapse into one), a
 * question in a language the corpus does not contain (nothing can answer it),
 * or a question with no *positive* gate (it passes on an answer that says
 * nothing, and inflates every rate it appears in).
 */
export function validateCorpus(
  corpus: Corpus,
  questions: Question[],
): string[] {
  const problems: string[] = [];

  if (!corpus.documents?.length) {
    problems.push('corpus.json declares no documents');
  }
  if (!corpus.languages?.length) {
    problems.push('corpus.json declares no languages');
  }
  if (!questions.length) {
    problems.push('questions.json declares no questions');
  }

  const languages = new Set(corpus.languages ?? []);
  for (const doc of corpus.documents ?? []) {
    if (!languages.has(doc.lang)) {
      problems.push(
        `document ${doc.file} has lang "${doc.lang}", which corpus.json does not list`,
      );
    }
  }

  const files = new Set((corpus.documents ?? []).map((d) => d.file));
  const seen = new Set<string>();
  for (const q of questions) {
    if (seen.has(q.id)) {
      problems.push(`duplicate question id "${q.id}"`);
    }
    seen.add(q.id);

    if (!languages.has(q.lang)) {
      problems.push(
        `question "${q.id}" asks in "${q.lang}", which corpus.json does not list`,
      );
    }
    if (!languages.has(q.docLang)) {
      problems.push(
        `question "${q.id}" points at docLang "${q.docLang}", which corpus.json does not list`,
      );
    }

    // A misspelt path would give the question a document that is never
    // uploaded, and its failures would land in a per-document row nobody can
    // find — or in none at all.
    for (const file of q.expectedFiles ?? []) {
      if (!files.has(file)) {
        problems.push(
          `question "${q.id}" expects file "${file}", which corpus.json does not list`,
        );
      }
    }
    if (q.expectedFiles && q.expectedFiles.length === 0) {
      problems.push(
        `question "${q.id}" declares an empty expectedFiles; omit the field instead`,
      );
    }
    if (q.type === 'guard-hallucination' && q.expectedFiles?.length) {
      problems.push(
        `question "${q.id}" is a guard-hallucination question, whose answer is in no document, but declares expectedFiles`,
      );
    }

    // Labels are chosen by the judge, so without a rubric nobody chooses one,
    // and the report's outcome table would count the question as unlabelled
    // on every run.
    if (q.judgeLabels) {
      if (!q.rubric) {
        problems.push(
          `question "${q.id}" declares judgeLabels but no rubric, so the judge is never asked to choose one`,
        );
      }
      if (
        q.judgeLabels.length < 2 ||
        new Set(q.judgeLabels).size !== q.judgeLabels.length
      ) {
        problems.push(
          `question "${q.id}" needs at least two distinct judgeLabels; one label distinguishes nothing`,
        );
      }
    }

    // `expectNone` is a supplemental constraint, never the whole gate. It says
    // what the answer must not contain, so an empty answer — or a refusal, or
    // a timeout that returned '' — satisfies it. A question needs at least one
    // positive gate (`expectAll`, `expectAny` or a rubric) before a pass is
    // evidence that the answer was right rather than merely quiet.
    const hasPositiveGate =
      (q.expectAll?.length ?? 0) + (q.expectAny?.length ?? 0) > 0 || !!q.rubric;
    if (!hasPositiveGate) {
      problems.push(
        q.expectNone?.length
          ? `question "${q.id}" only says what the answer must not contain, so an empty answer passes it`
          : `question "${q.id}" has neither an expectation nor a rubric, so it can never fail`,
      );
    }
  }

  return problems;
}

/**
 * Must this question's answer carry no citation?
 *
 * Yes when its answer is in no document: every `guard-hallucination`
 * question, and a `guard-sycophancy` question whose false premise is about
 * something the documents never mention (no `expectedFiles`). Citing a file
 * beside "the documents do not cover this" attaches a source to a statement of
 * absence, which is the defect #1218 fixed in the answer prompt — and a
 * citation is what makes a general-knowledge answer look like the company's.
 *
 * A false premise the documents *contradict* names the document that
 * corrects it, and a correction citing it is right, so it is left alone.
 *
 * Takes the two fields both a `Question` and a `CaseResult` carry, so the
 * report can ask the same question of a result file.
 */
export function forbidsCitation(q: {
  type: QuestionType;
  expectedFiles?: string[];
}): boolean {
  if (q.type === 'guard-hallucination') {
    return true;
  }
  return q.type === 'guard-sycophancy' && !q.expectedFiles?.length;
}
