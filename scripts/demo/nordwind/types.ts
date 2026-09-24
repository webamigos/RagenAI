/**
 * The shape of one locale's Nordwind Logistics content.
 *
 * Everything that is *language* lives in `content-pl.ts` / `content-en.ts`;
 * everything that is *structure* — which person owns which document, which
 * page cites which quote, which question was never answered — is expressed
 * through the keys below, so the two locales cannot drift apart structurally.
 * `seed-nordwind.ts` reads only this shape.
 */

export type Locale = 'pl' | 'en';

export type PersonKey =
  | 'anna'
  | 'tomasz'
  | 'magdalena'
  | 'piotr'
  | 'katarzyna'
  | 'michal'
  | 'joanna'
  | 'pawel'
  /** A former employee: a user row with no membership, who still owns a page. */
  | 'robert';

export type TeamKey = 'hr' | 'sales' | 'support' | 'compliance';

export type FolderKey =
  'hr' | 'payroll' | 'sales' | 'support' | 'compliance' | 'operations';

export type DocKey =
  | 'leave-policy'
  | 'hr-faq'
  | 'remote-work'
  | 'onboarding'
  | 'payroll-calendar'
  | 'travel-expense'
  | 'price-list'
  | 'quoting-rules'
  | 'returns'
  | 'sla'
  | 'escalation'
  | 'gdpr'
  | 'fleet-safety'
  | 'code-of-conduct'
  | 'adr-draft';

export type AssistantKey = 'hr' | 'sales' | 'support' | 'compliance';

export type DemoFileType = 'PDF' | 'DOCX' | 'XLSX' | 'URL' | 'MARKDOWN';

export interface DemoPerson {
  name: string;
  /** Local part only; the domain is fixed. */
  emailLocal: string;
  /** Job title, used in audit/decision prose only. */
  title: string;
}

export interface DemoDocument {
  /** What the knowledge base lists — a file name, or the URL for a web page. */
  fileName: string;
  /** The document title (UserDocument.title / DocumentVersion.title). */
  title: string;
  /**
   * Every version's text, oldest first. The last one is the active version.
   * Written as ingest leaves it: Docling's markdown for PDF/DOCX, a markdown
   * table per sheet for XLSX, the scraped article for a URL.
   */
  versions: string[];
  /** A comment for each version after the first, as a person would write it. */
  versionComments?: string[];
}

export interface DemoPageSource {
  doc: DocKey;
  /** Must occur verbatim in the cited version's text; the seed refuses otherwise. */
  quote: string;
  /** 1-based version the curator read. Defaults to the active (last) one. */
  version?: number;
  /** A reader's pointer, e.g. "§2". Defaults to the heading the quote sits under. */
  span?: string;
}

export interface DemoPage {
  key: string;
  title: string;
  /** One sentence under the title. */
  summary: string;
  /** Claims in order; claim n cites source n. */
  claims: { text: string; source: DemoPageSource }[];
}

export interface DemoThreadSource {
  /** A document, or `page:<key>` for a published Brain page's vehicle file. */
  ref: DocKey | `page:${string}`;
  snippet: string;
}

export interface DemoThread {
  title: string;
  question: string;
  /** Uses [n] markers, where n is the 1-based position in `sources`. */
  answer: string;
  sources: DemoThreadSource[];
  /** Optional follow-up turn in the same thread. */
  followUp?: { question: string; answer: string; sources: DemoThreadSource[] };
}

export interface DemoContent {
  orgName: string;
  people: Record<PersonKey, DemoPerson>;
  teams: Record<TeamKey, string>;
  folders: Record<FolderKey, string>;
  documents: Record<DocKey, DemoDocument>;
  assistants: Record<AssistantKey, { title: string; instructions: string }>;
  pages: Record<string, DemoPage>;
  /** Keyed by assistant; the first assistant's threads are the "main" ones. */
  threads: Partial<Record<AssistantKey, DemoThread[]>>;
  /**
   * Questions asked over the last 30 days, for knowledge analytics. Each is
   * answered from `docs` (retrieved, first one cited) unless `docs` is empty,
   * which is an unanswered question.
   */
  analyticsQuestions: { question: string; docs: DocKey[]; weight: number }[];
  /** The refusal text an unanswered question gets. */
  noAnswer: string;
  /** Text for the contradiction/stale findings, in the org's language. */
  findingText: {
    leaveDays: string;
    leaveNotice: string;
  };
  guardrail: { name: string; description: string; pattern: string };
}
