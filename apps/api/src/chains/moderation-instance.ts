import OpenAI from 'openai';

/**
 * Duplicated from ragen-app's src/app/lib/services/llm.ts (the
 * createModerationInstance/ModerationInstance/ModerationResult exports
 * only, not the rest of that file's default-model-resolution logic) — see
 * docs/adrs/21-monorepo-and-api-decoupling.md. Keep in sync manually.
 */
export interface ModerationResult {
  flagged: boolean;
  categories: Record<string, boolean>;
}

// Content moderation using OpenAI Moderation API directly.
// Uses a dedicated OPENAI_MODERATION_KEY with fallback to OPENAI_API_KEY.
export const createModerationInstance = (orgApiKey?: string) => {
  const apiKey =
    orgApiKey ||
    process.env.OPENAI_MODERATION_KEY ||
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'Cannot create moderation instance: set OPENAI_MODERATION_KEY or OPENAI_API_KEY',
    );
  }

  const openaiClient = new OpenAI({ apiKey });

  return {
    async invoke({ input }: { input: string }): Promise<{
      results: ModerationResult[];
    }> {
      const response = await openaiClient.moderations.create({
        input,
      });

      return {
        results: response.results.map((r) => ({
          flagged: r.flagged,
          categories: r.categories as unknown as Record<string, boolean>,
        })),
      };
    },
  };
};

export type ModerationInstance = ReturnType<typeof createModerationInstance>;
