# smartRAG

Retrieval Augmented Generation (RAG)

## Local development

Run:

`docker compose up` in root directory - postgres database and redis will up.

Set `.env.local` to:

```bash
# LOCAL
DATABASE_URL="postgresql://postgres:pass123@localhost:5432/smartrag"
DATABASE_DIRECT_URL="postgresql://postgres:pass123@localhost:5432/smartrag"

```


## Working with Temporal

Temporal is a great tool for managing async tasks without complexity of managing queues and preparing, testing, maintaining distributed architecture. One workflow can be used by many apps.

We can use it for:
* Document processing workflow
* File upload process
* Creating organization with numeric id
* Send mails to users on defined interval (eg. sequence of onboarding e-mails with every three days in first 10 days)
* End free trial after 14 days
* Exchange events between backend events (separate project/repo)

In the App we can use Signals and Queries from workflows. Signals and Queries need to be defined in `src/temporal/src/workflows.ts`

```ts
// signal - run action
export const cancelEmbeddingSignal = wf.defineSignal('cancelEmbedding');

// query - fetch info
export const embeddingStateQuery =
  wf.defineQuery<EmbeddingState>('embeddingState');
```

Usage in the App:

```ts
import { getTemporalClient } from '@/temporal/src/client';


const workflow = await getTemporalClient().workflow.getHandle(EXAMPLE_ID);

try {
  // send signal to cancel embedding
  await workflow.signal('cancelEmbedding');
} catch (e) {
  // ...
}

try {
  // get embedding state
  const embeddingState = await workflow.query('embeddingState');
} catch (e) {
  // ...
}
```

* [Setup Temporal dev server locally](https://learn.temporal.io/getting_started/typescript/dev_environment/#set-up-a-local-temporal-service-for-development-with-temporal-cli)

Command to start temporal dev server:

```bash
temporal server start-dev
```

In production probably we will use Temporal Cloud.

There is a new temporal directory and couple of scripts
