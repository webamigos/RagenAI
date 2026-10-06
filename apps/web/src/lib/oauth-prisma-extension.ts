import { Prisma } from '@/generated/prisma/client';
import { sanitizeOAuthScalarLists } from './oauth-scalar-lists';

/** Runs at the Prisma boundary, including inside adapter transactions. */
export const oauthScalarListsExtension = Prisma.defineExtension({
  name: 'oauth-scalar-lists',
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        if (
          [
            'create',
            'createMany',
            'createManyAndReturn',
            'update',
            'updateMany',
            'updateManyAndReturn',
            'upsert',
          ].includes(operation)
        ) {
          const write = args as Record<string, unknown>;
          for (const field of ['data', 'create', 'update']) {
            if (field in write) {
              write[field] = sanitizeOAuthScalarLists(model, write[field]);
            }
          }
        }
        return query(args);
      },
    },
  },
});
