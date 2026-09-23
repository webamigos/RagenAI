import { KNOWLEDGE_PAGE_TYPES } from '@ragenai/brain-contracts';
import { z } from 'zod';

/**
 * What the model is asked to return for one window of one document.
 *
 * Every claim and every relation that says it is stated in the document
 * carries a **verbatim quote**. That is the whole design: the quote is checked
 * against the source text before anything is kept (see `verify-quotes.ts`), so
 * a citation cannot point at a sentence the document does not contain. The
 * `locator` is the model's human-readable pointer ("§2", "p. 4", a heading) —
 * useful to a reader, never trusted as the anchor.
 *
 * Bounded everywhere: an unbounded array in a structured-output schema is an
 * invitation to a response that costs more than the document did.
 */
export const extractedEntitySchema = z.object({
  /** Stable within one extraction; claims and relations refer to it. */
  key: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(160),
  type: z.enum(KNOWLEDGE_PAGE_TYPES),
  /** One or two sentences in the document's own language. */
  description: z.string().trim().min(1).max(600),
});

export const extractedClaimSchema = z.object({
  entityKey: z.string().trim().min(1).max(80),
  /** The fact, stated plainly, in the document's language. */
  statement: z.string().trim().min(1).max(500),
  /** Copied character for character from the document. */
  quote: z.string().trim().min(8).max(600),
  locator: z.string().trim().max(80).default(''),
});

export const extractedRelationSchema = z.object({
  from: z.string().trim().min(1).max(80),
  to: z.string().trim().min(1).max(80),
  /** A short verb phrase: "owns", "approves", "is part of". */
  kind: z.string().trim().min(1).max(60),
  /** Present when the document states the relation; absent when inferred. */
  quote: z.string().trim().min(8).max(600).nullable().default(null),
});

export const extractionResultSchema = z.object({
  entities: z.array(extractedEntitySchema).max(40),
  claims: z.array(extractedClaimSchema).max(200),
  relations: z.array(extractedRelationSchema).max(80),
});

export type ExtractedEntity = z.infer<typeof extractedEntitySchema>;
export type ExtractedClaim = z.infer<typeof extractedClaimSchema>;
export type ExtractedRelation = z.infer<typeof extractedRelationSchema>;
export type ExtractionResult = z.infer<typeof extractionResultSchema>;
