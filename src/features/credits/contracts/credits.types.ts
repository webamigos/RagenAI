import type {
  CreditLedgerReason,
  CreditOperation,
} from '@/generated/prisma/client';

export type CreditBalance = {
  organizationId: string;
  balance: number;
  lifetimeGranted: number;
  lifetimeSpent: number;
  updatedAt: Date;
};

export type CreditLedgerEntryView = {
  publicId: string;
  organizationId: string;
  userId: string | null;
  delta: number;
  balanceAfter: number;
  reason: CreditLedgerReason;
  operation: CreditOperation | null;
  referenceId: string | null;
  idempotencyKey: string | null;
  note: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

export type SpendCreditsInput = {
  organizationId: string;
  amount: number;
  operation: CreditOperation;
  referenceId?: string;
  userId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
};

export type GrantCreditsInput = {
  organizationId: string;
  amount: number;
  reason: Exclude<CreditLedgerReason, 'SPEND' | 'REFUND'>;
  actorUserId?: string;
  note?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
};

export type SpendCreditsResult =
  | { ok: true; balance: number; ledgerPublicId: string; deduplicated: boolean }
  | { ok: false; reason: 'insufficient'; balance: number; required: number };
