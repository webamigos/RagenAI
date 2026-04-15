import type { RejestrioLead } from '@/generated/prisma/client';

export type RejestrioLeadDto = Pick<
  RejestrioLead,
  | 'id'
  | 'organizationId'
  | 'nip'
  | 'krs'
  | 'companyName'
  | 'pkdMain'
  | 'pkdCategory'
  | 'formaPrawna'
  | 'revenueLast'
  | 'profitLast'
  | 'revenueRocznik'
  | 'employeeSize'
  | 'isBankrupt'
  | 'isLiquidation'
  | 'isWykreslona'
  | 'isNaGpw'
  | 'enrichedAt'
  | 'enrichmentSource'
  | 'createdAt'
  | 'updatedAt'
>;

/**
 * Minimal input for upserting a RejestrioLead snapshot. All fields
 * are optional except `organizationId` and one of `nip` / `krs` —
 * the command enforces at-least-one-of.
 */
export type UpsertRejestrioLeadInput = {
  organizationId: string;
  nip?: string | null;
  krs?: number | null;
  companyName?: string | null;
  pkdMain?: string | null;
  pkdCategory?: string | null;
  formaPrawna?: string | null;
  revenueLast?: number | null;
  profitLast?: number | null;
  revenueRocznik?: number | null;
  employeeSize?: string | null;
  isBankrupt?: boolean | null;
  isLiquidation?: boolean | null;
  isWykreslona?: boolean | null;
  isNaGpw?: boolean | null;
  enrichmentSource?: string | null;
};
