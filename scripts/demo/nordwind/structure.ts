/**
 * The locale-independent half of the Nordwind demo: who holds which role, which
 * folder a document sits in, what state each Brain page is in and how pages
 * connect. The words for all of it are in `content-*.ts`.
 */
import type {
  AssistantKey,
  DemoFileType,
  DocKey,
  FolderKey,
  PersonKey,
  TeamKey,
} from './types.js';

export const DEMO_PASSWORD = 'NordwindDemo2026!';
export const EMAIL_DOMAIN = 'nordwind-logistics.example';

export type OrgRole = 'owner' | 'admin' | 'member';

/** `null` role = a former employee: a user with no membership. */
export const PEOPLE: Record<
  PersonKey,
  { role: OrgRole | null; teams: TeamKey[] }
> = {
  anna: { role: 'owner', teams: [] },
  tomasz: { role: 'admin', teams: ['support'] },
  magdalena: { role: 'admin', teams: ['hr'] },
  piotr: { role: 'member', teams: ['sales'] },
  katarzyna: { role: 'member', teams: ['support'] },
  michal: { role: 'member', teams: ['compliance'] },
  joanna: { role: 'member', teams: ['hr'] },
  pawel: { role: 'member', teams: ['compliance'] },
  robert: { role: null, teams: [] },
};

/** Folder tree. `payroll` is the one restricted to a team. */
export const FOLDERS: Record<
  FolderKey,
  { parent?: FolderKey; owner: PersonKey; team?: TeamKey; strict?: boolean }
> = {
  hr: { owner: 'magdalena' },
  payroll: { parent: 'hr', owner: 'joanna', team: 'hr', strict: true },
  sales: { owner: 'piotr' },
  support: { owner: 'katarzyna' },
  compliance: { owner: 'michal' },
  operations: { owner: 'tomasz' },
};

export interface DocMeta {
  type: DemoFileType;
  folder: FolderKey;
  owner: PersonKey;
  /** Bytes, as the upload recorded them. */
  size: number;
  pageCount: number | null;
  /** Days before the seed ran that the first version was uploaded. */
  ageDays: number;
  /** Uploaded to Ragen Brain only and awaiting curation. */
  staged?: boolean;
}

export const DOCS: Record<DocKey, DocMeta> = {
  'leave-policy': {
    type: 'PDF',
    folder: 'hr',
    owner: 'magdalena',
    size: 412_883,
    pageCount: 4,
    ageDays: 62,
  },
  'hr-faq': {
    type: 'DOCX',
    folder: 'hr',
    owner: 'joanna',
    size: 88_412,
    pageCount: 3,
    ageDays: 690,
  },
  'remote-work': {
    type: 'PDF',
    folder: 'hr',
    owner: 'magdalena',
    size: 301_556,
    pageCount: 3,
    ageDays: 240,
  },
  onboarding: {
    type: 'DOCX',
    folder: 'hr',
    owner: 'magdalena',
    size: 64_120,
    pageCount: 2,
    ageDays: 120,
  },
  'payroll-calendar': {
    type: 'XLSX',
    folder: 'payroll',
    owner: 'joanna',
    size: 41_872,
    pageCount: 1,
    ageDays: 45,
  },
  'travel-expense': {
    type: 'PDF',
    folder: 'operations',
    owner: 'tomasz',
    size: 522_004,
    pageCount: 5,
    ageDays: 150,
  },
  'price-list': {
    type: 'XLSX',
    folder: 'sales',
    owner: 'piotr',
    size: 57_310,
    pageCount: 2,
    ageDays: 38,
  },
  'quoting-rules': {
    type: 'MARKDOWN',
    folder: 'sales',
    owner: 'piotr',
    size: 6_214,
    pageCount: 1,
    ageDays: 75,
  },
  returns: {
    type: 'URL',
    folder: 'support',
    owner: 'katarzyna',
    size: 18_540,
    pageCount: null,
    ageDays: 20,
  },
  sla: {
    type: 'PDF',
    folder: 'support',
    owner: 'katarzyna',
    size: 688_117,
    pageCount: 6,
    ageDays: 95,
  },
  escalation: {
    type: 'XLSX',
    folder: 'support',
    owner: 'katarzyna',
    size: 33_096,
    pageCount: 1,
    ageDays: 55,
  },
  gdpr: {
    type: 'DOCX',
    folder: 'compliance',
    owner: 'michal',
    size: 97_455,
    pageCount: 4,
    ageDays: 180,
  },
  'fleet-safety': {
    type: 'PDF',
    folder: 'operations',
    owner: 'pawel',
    size: 945_210,
    pageCount: 7,
    ageDays: 110,
  },
  'code-of-conduct': {
    type: 'MARKDOWN',
    folder: 'compliance',
    owner: 'michal',
    size: 7_830,
    pageCount: 1,
    ageDays: 300,
  },
  'adr-draft': {
    type: 'DOCX',
    folder: 'operations',
    owner: 'pawel',
    size: 52_600,
    pageCount: 2,
    ageDays: 2,
    staged: true,
  },
};

/** The document the Brain extractor failed on. */
export const EXTRACTION_FAILED_DOC: DocKey = 'payroll-calendar';

export const ASSISTANTS: Record<
  AssistantKey,
  { folders: FolderKey[]; model: string; owner: PersonKey; team: TeamKey }
> = {
  hr: {
    folders: ['hr', 'payroll', 'operations'],
    model: 'gpt-5.4',
    owner: 'magdalena',
    team: 'hr',
  },
  sales: {
    folders: ['sales', 'support'],
    model: 'claude-sonnet-4-6',
    owner: 'piotr',
    team: 'sales',
  },
  support: {
    folders: ['support', 'operations'],
    model: 'gemini-2.5-flash',
    owner: 'katarzyna',
    team: 'support',
  },
  compliance: {
    folders: ['compliance', 'hr'],
    model: 'gpt-5.4-mini',
    owner: 'michal',
    team: 'compliance',
  },
};

export type PageType = 'PROCESS' | 'ENTITY' | 'POLICY' | 'PRODUCT' | 'ROLE';
export type PageStatus = 'CANDIDATE' | 'APPROVED' | 'REJECTED' | 'STALE';

export interface PageMeta {
  type: PageType;
  status: PageStatus;
  owner: PersonKey | null;
  published?: boolean;
  /** Restricted to a team rather than the whole organization. */
  team?: TeamKey;
}

/**
 * About forty pages in six clusters, which is what gives the graph its
 * communities: leave & working time, onboarding, sales, customer support,
 * compliance, and fleet & travel.
 */
export const PAGES: Record<string, PageMeta> = {
  // Leave & working time
  'annual-leave': {
    type: 'POLICY',
    status: 'APPROVED',
    owner: 'magdalena',
    published: true,
  },
  'leave-faq': { type: 'POLICY', status: 'CANDIDATE', owner: 'joanna' },
  'leave-request': { type: 'PROCESS', status: 'APPROVED', owner: 'magdalena' },
  'leave-request-faq': {
    type: 'PROCESS',
    status: 'CANDIDATE',
    owner: 'joanna',
  },
  'on-demand-leave': {
    type: 'POLICY',
    status: 'APPROVED',
    owner: 'magdalena',
    published: true,
  },
  'peak-season-leave': { type: 'POLICY', status: 'APPROVED', owner: 'tomasz' },
  'remote-work': { type: 'POLICY', status: 'STALE', owner: 'magdalena' },
  'remote-allowance': { type: 'POLICY', status: 'CANDIDATE', owner: null },
  'hr-department': { type: 'ENTITY', status: 'APPROVED', owner: 'magdalena' },
  payday: { type: 'POLICY', status: 'REJECTED', owner: 'joanna' },
  // Onboarding
  onboarding: {
    type: 'PROCESS',
    status: 'APPROVED',
    owner: 'magdalena',
    published: true,
  },
  buddy: { type: 'ROLE', status: 'APPROVED', owner: 'magdalena' },
  'safety-induction': { type: 'PROCESS', status: 'CANDIDATE', owner: 'pawel' },
  'gdpr-training': { type: 'PROCESS', status: 'APPROVED', owner: 'michal' },
  'it-access': { type: 'PROCESS', status: 'CANDIDATE', owner: null },
  'probation-review': {
    type: 'PROCESS',
    status: 'CANDIDATE',
    owner: 'magdalena',
  },
  // Sales
  'discount-approval': {
    type: 'PROCESS',
    status: 'APPROVED',
    owner: 'piotr',
    published: true,
  },
  'quote-validity': { type: 'POLICY', status: 'APPROVED', owner: 'piotr' },
  'frame-agreement': { type: 'ENTITY', status: 'APPROVED', owner: 'robert' },
  'payment-terms': { type: 'POLICY', status: 'APPROVED', owner: 'piotr' },
  ftl: { type: 'PRODUCT', status: 'APPROVED', owner: 'piotr' },
  'cold-chain': { type: 'PRODUCT', status: 'CANDIDATE', owner: null },
  warehousing: { type: 'PRODUCT', status: 'APPROVED', owner: 'piotr' },
  'volume-discounts': { type: 'POLICY', status: 'CANDIDATE', owner: 'piotr' },
  'lead-qualification': {
    type: 'PROCESS',
    status: 'CANDIDATE',
    owner: 'piotr',
    team: 'sales',
  },
  // Customer support
  claims: {
    type: 'PROCESS',
    status: 'APPROVED',
    owner: 'katarzyna',
    published: true,
  },
  'damage-report': { type: 'ENTITY', status: 'APPROVED', owner: 'katarzyna' },
  'cmr-liability': { type: 'POLICY', status: 'CANDIDATE', owner: 'michal' },
  'on-time-delivery': {
    type: 'POLICY',
    status: 'APPROVED',
    owner: 'katarzyna',
  },
  'response-times': { type: 'POLICY', status: 'APPROVED', owner: 'katarzyna' },
  'p1-escalation': { type: 'PROCESS', status: 'APPROVED', owner: 'katarzyna' },
  dispatcher: { type: 'ROLE', status: 'CANDIDATE', owner: 'tomasz' },
  'tracking-portal': { type: 'PRODUCT', status: 'STALE', owner: 'katarzyna' },
  // Compliance
  'data-breach': {
    type: 'PROCESS',
    status: 'APPROVED',
    owner: 'michal',
    published: true,
  },
  retention: { type: 'POLICY', status: 'APPROVED', owner: 'michal' },
  dpa: { type: 'ENTITY', status: 'APPROVED', owner: 'michal' },
  dpo: { type: 'ROLE', status: 'APPROVED', owner: 'michal' },
  gifts: { type: 'POLICY', status: 'APPROVED', owner: 'michal' },
  sanctions: { type: 'PROCESS', status: 'CANDIDATE', owner: 'michal' },
  whistleblowing: { type: 'PROCESS', status: 'APPROVED', owner: 'michal' },
  // Fleet & travel
  'vehicle-check': { type: 'PROCESS', status: 'APPROVED', owner: 'pawel' },
  'driving-time': { type: 'POLICY', status: 'APPROVED', owner: 'pawel' },
  'load-securing': { type: 'PROCESS', status: 'CANDIDATE', owner: 'pawel' },
  accident: { type: 'PROCESS', status: 'APPROVED', owner: 'pawel' },
  'travel-approval': { type: 'PROCESS', status: 'APPROVED', owner: 'tomasz' },
  'per-diem': {
    type: 'POLICY',
    status: 'APPROVED',
    owner: 'tomasz',
    published: true,
  },
  'company-card': { type: 'POLICY', status: 'STALE', owner: 'tomasz' },
};

export type EdgeOrigin = 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS';

/** [from, to, kind, origin, confidence]. `whistleblowing` has none: the orphan. */
export const EDGES: [string, string, string, EdgeOrigin, number | null][] = [
  // Leave & working time
  ['leave-request', 'annual-leave', 'part_of', 'EXTRACTED', null],
  ['on-demand-leave', 'annual-leave', 'part_of', 'EXTRACTED', null],
  ['peak-season-leave', 'annual-leave', 'constrains', 'EXTRACTED', null],
  ['leave-faq', 'annual-leave', 'contradicts', 'AMBIGUOUS', 0.55],
  ['leave-request-faq', 'leave-request', 'contradicts', 'AMBIGUOUS', 0.5],
  ['hr-department', 'annual-leave', 'owns', 'EXTRACTED', null],
  ['hr-department', 'remote-work', 'owns', 'INFERRED', 0.82],
  ['remote-allowance', 'remote-work', 'part_of', 'EXTRACTED', null],
  ['payday', 'hr-department', 'related_to', 'INFERRED', 0.61],
  // Onboarding
  ['buddy', 'onboarding', 'part_of', 'EXTRACTED', null],
  ['safety-induction', 'onboarding', 'part_of', 'EXTRACTED', null],
  ['gdpr-training', 'onboarding', 'part_of', 'EXTRACTED', null],
  ['it-access', 'onboarding', 'part_of', 'EXTRACTED', null],
  ['probation-review', 'onboarding', 'part_of', 'EXTRACTED', null],
  ['hr-department', 'onboarding', 'owns', 'INFERRED', 0.77],
  ['it-access', 'remote-work', 'related_to', 'INFERRED', 0.58],
  // Sales
  ['volume-discounts', 'discount-approval', 'constrains', 'EXTRACTED', null],
  ['quote-validity', 'discount-approval', 'related_to', 'INFERRED', 0.66],
  ['frame-agreement', 'payment-terms', 'related_to', 'EXTRACTED', null],
  ['payment-terms', 'quote-validity', 'related_to', 'EXTRACTED', null],
  ['ftl', 'volume-discounts', 'related_to', 'EXTRACTED', null],
  ['cold-chain', 'ftl', 'related_to', 'INFERRED', 0.74],
  ['warehousing', 'volume-discounts', 'related_to', 'EXTRACTED', null],
  ['lead-qualification', 'quote-validity', 'precedes', 'EXTRACTED', null],
  ['frame-agreement', 'discount-approval', 'related_to', 'AMBIGUOUS', 0.45],
  // Customer support
  ['damage-report', 'claims', 'part_of', 'EXTRACTED', null],
  ['cmr-liability', 'claims', 'constrains', 'EXTRACTED', null],
  ['response-times', 'on-time-delivery', 'related_to', 'INFERRED', 0.69],
  ['p1-escalation', 'response-times', 'implements', 'EXTRACTED', null],
  ['dispatcher', 'p1-escalation', 'performs', 'EXTRACTED', null],
  ['tracking-portal', 'on-time-delivery', 'related_to', 'INFERRED', 0.63],
  ['claims', 'on-time-delivery', 'related_to', 'AMBIGUOUS', 0.4],
  ['claims', 'response-times', 'related_to', 'EXTRACTED', null],
  ['tracking-portal', 'response-times', 'related_to', 'EXTRACTED', null],
  // Compliance
  ['dpo', 'data-breach', 'performs', 'EXTRACTED', null],
  ['retention', 'dpa', 'related_to', 'INFERRED', 0.72],
  ['dpa', 'data-breach', 'related_to', 'INFERRED', 0.6],
  ['sanctions', 'gifts', 'related_to', 'EXTRACTED', null],
  ['sanctions', 'dpa', 'related_to', 'EXTRACTED', null],
  ['gdpr-training', 'dpo', 'related_to', 'INFERRED', 0.64],
  // Fleet & travel
  ['vehicle-check', 'load-securing', 'precedes', 'EXTRACTED', null],
  ['driving-time', 'vehicle-check', 'related_to', 'EXTRACTED', null],
  ['accident', 'dispatcher', 'related_to', 'INFERRED', 0.66],
  ['accident', 'vehicle-check', 'related_to', 'EXTRACTED', null],
  ['per-diem', 'driving-time', 'related_to', 'EXTRACTED', null],
  ['company-card', 'vehicle-check', 'related_to', 'INFERRED', 0.6],
  ['per-diem', 'travel-approval', 'part_of', 'EXTRACTED', null],
  ['company-card', 'travel-approval', 'related_to', 'INFERRED', 0.71],
  ['safety-induction', 'vehicle-check', 'related_to', 'AMBIGUOUS', 0.42],
  // Bridges between clusters
  ['cmr-liability', 'dpa', 'related_to', 'AMBIGUOUS', 0.35],
  ['payment-terms', 'claims', 'related_to', 'AMBIGUOUS', 0.4],
];

/** Pages that get a decision history, and what happened to them. */
export const DECISIONS: {
  page: string;
  actor: PersonKey;
  action: 'APPROVE' | 'SET_OWNER' | 'PUBLISH' | 'REJECT';
  daysAgo: number;
}[] = [
  {
    page: 'annual-leave',
    actor: 'magdalena',
    action: 'SET_OWNER',
    daysAgo: 21,
  },
  { page: 'annual-leave', actor: 'magdalena', action: 'APPROVE', daysAgo: 20 },
  { page: 'annual-leave', actor: 'anna', action: 'PUBLISH', daysAgo: 19 },
  {
    page: 'discount-approval',
    actor: 'piotr',
    action: 'SET_OWNER',
    daysAgo: 16,
  },
  { page: 'discount-approval', actor: 'piotr', action: 'APPROVE', daysAgo: 15 },
  {
    page: 'discount-approval',
    actor: 'tomasz',
    action: 'PUBLISH',
    daysAgo: 14,
  },
  { page: 'data-breach', actor: 'michal', action: 'APPROVE', daysAgo: 11 },
  { page: 'data-breach', actor: 'michal', action: 'PUBLISH', daysAgo: 10 },
  { page: 'payday', actor: 'magdalena', action: 'REJECT', daysAgo: 8 },
];

/** How far back the knowledge-analytics and AI-usage history reaches. */
export const ANALYTICS_DAYS = 30;
