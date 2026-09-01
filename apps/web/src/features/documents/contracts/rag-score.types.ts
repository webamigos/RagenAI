import { z } from 'zod';

export const ragScoreSchema = z.object({
  chunkStructure: z
    .number()
    .min(0)
    .max(10)
    .describe(
      'Presence of numbered headings (### 1.1) that create natural chunk boundaries',
    ),
  avgChunkSize: z
    .number()
    .min(0)
    .max(10)
    .describe(
      'Whether content sections are 80-150 words each (ideal for embeddings)',
    ),
  entityDensity: z
    .number()
    .min(0)
    .max(10)
    .describe(
      'Density of specific entities: names, amounts, dates, legal refs, contact info',
    ),
  selfContainedness: z
    .number()
    .min(0)
    .max(10)
    .describe(
      'Whether each section is understandable without reading other sections',
    ),
  qaAdherence: z
    .number()
    .min(0)
    .max(10)
    .describe('Whether sections follow a question + answer structure'),
  total: z
    .number()
    .min(0)
    .max(100)
    .describe('Weighted overall RAG readiness score'),
  suggestions: z
    .array(z.string().max(300))
    .max(5)
    .describe('Concrete, actionable improvement suggestions'),
});

export type RagScore = z.infer<typeof ragScoreSchema>;
