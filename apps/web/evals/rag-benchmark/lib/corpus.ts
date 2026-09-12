import { readFileSync } from 'node:fs';
import { join, isAbsolute, resolve } from 'node:path';
import type { Corpus, Question } from './types';

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
 * or a question with no gate at all (it passes unconditionally and inflates
 * every rate it appears in).
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

    const hasAssertion =
      (q.expectAll?.length ?? 0) +
        (q.expectAny?.length ?? 0) +
        (q.expectNone?.length ?? 0) >
      0;
    if (!hasAssertion && !q.rubric) {
      problems.push(
        `question "${q.id}" has neither an expectation nor a rubric, so it can never fail`,
      );
    }
  }

  return problems;
}
