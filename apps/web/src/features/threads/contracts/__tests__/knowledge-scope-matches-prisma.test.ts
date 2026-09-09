import { describe, it, expect } from 'vitest';

import { KNOWLEDGE_SCOPES } from '@ragenai/platform-contracts';
import { KnowledgeScope } from '@/generated/prisma/enums';

/**
 * The contracts package declares the three scopes and the Prisma schema
 * declares them again — it has to, since the column is an enum. Neither can
 * import the other: `@ragenai/platform-contracts` must not depend on a
 * generated client (ADR-33), and the schema is not TypeScript.
 *
 * So this is the seam, and it lives here rather than in the package. Adding a
 * fourth level to one side and not the other is a typecheck-clean change that
 * fails at runtime on the first write, which is precisely the drift
 * docs/lessons/hand-copied-lists-drift-and-typecheck-only-sees-one.md is about.
 */
describe('the knowledge scope vocabulary', () => {
  it('is the same three values in the contract and the database enum', () => {
    expect(Object.values(KnowledgeScope).sort()).toEqual(
      [...KNOWLEDGE_SCOPES].sort(),
    );
  });

  it('spells them identically, so nothing has to translate', () => {
    // Prisma maps only the database side of an `@map`ped enum member, so a
    // prettier wire spelling would silently reintroduce a translation step.
    for (const scope of KNOWLEDGE_SCOPES) {
      expect(KnowledgeScope[scope]).toBe(scope);
    }
  });
});
