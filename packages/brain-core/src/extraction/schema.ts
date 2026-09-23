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
 * Two schemas, for two jobs. The **provider schema** is the shape and nothing
 * else — it is what the model is constrained to. Vertex compiles a response
 * schema into a state machine and refuses one with too many states ("too many
 * states for serving"), which is exactly what length limits and array bounds
 * produce; the first real run of this extraction failed on that. The
 * **item schemas** carry the limits and are applied by `parseExtraction`
 * afterwards, per item, so one over-long quote drops one claim rather than
 * failing the window and paying for a retry.
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

/** Per-window caps, applied after parsing. They bound cost, not validity. */
export const EXTRACTION_LIMITS = {
  entities: 40,
  claims: 200,
  relations: 80,
} as const;

/** What the model must return: the shape, with no limits (see above). */
export const extractionProviderSchema = z.object({
  entities: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      type: z.enum(KNOWLEDGE_PAGE_TYPES),
      description: z.string(),
    }),
  ),
  claims: z.array(
    z.object({
      entityKey: z.string(),
      statement: z.string(),
      quote: z.string(),
      locator: z.string(),
    }),
  ),
  relations: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      kind: z.string(),
      quote: z.string().nullable(),
    }),
  ),
});

/** One window's validated result. */
export const extractionResultSchema = z.object({
  entities: z.array(extractedEntitySchema),
  claims: z.array(extractedClaimSchema),
  relations: z.array(extractedRelationSchema),
});

export type ParsedExtraction =
  | { ok: true; result: ExtractionResult; rejectedItems: number }
  | { ok: false; error: z.ZodError };

/**
 * Validate an answer: the shape as a whole, then each item on its own.
 *
 * A wrong shape is a failed answer and earns the retry. A right shape with a
 * bad item — a quote under eight characters, a title of two hundred — keeps
 * everything else and counts what it dropped, so the loss is reported rather
 * than silent. The caps apply last.
 */
export function parseExtraction(raw: unknown): ParsedExtraction {
  const shape = extractionProviderSchema.safeParse(raw);
  if (!shape.success) {
    return { ok: false, error: shape.error };
  }
  let rejectedItems = 0;
  const keep = <T>(items: unknown[], schema: z.ZodType<T>, cap: number) => {
    const out: T[] = [];
    for (const item of items) {
      const parsed = schema.safeParse(item);
      if (parsed.success) {
        out.push(parsed.data);
      } else {
        rejectedItems += 1;
      }
    }
    rejectedItems += Math.max(0, out.length - cap);
    return out.slice(0, cap);
  };
  const result: ExtractionResult = {
    entities: keep(
      shape.data.entities,
      extractedEntitySchema,
      EXTRACTION_LIMITS.entities,
    ),
    claims: keep(
      shape.data.claims,
      extractedClaimSchema,
      EXTRACTION_LIMITS.claims,
    ),
    relations: keep(
      shape.data.relations,
      extractedRelationSchema,
      EXTRACTION_LIMITS.relations,
    ),
  };
  return { ok: true, result, rejectedItems };
}

export type ExtractedEntity = z.infer<typeof extractedEntitySchema>;
export type ExtractedClaim = z.infer<typeof extractedClaimSchema>;
export type ExtractedRelation = z.infer<typeof extractedRelationSchema>;
export type ExtractionResult = z.infer<typeof extractionResultSchema>;
