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

Temporal is a great tool for managing async tasks without the complexity of managing queues and architecture. I allow easily testing and maintaining distributed architecture. One workflow can be used by many apps.

We can use it for:
* Document processing workflow
* File upload process
* Creating organization with numeric ID
* Send mails to users on defined interval (e.g. sequence of onboarding e-mails with every three days in first 10 days)
* End free trial after 14 days
* Exchange events between backend events (separate project/repo)

In the App, we can use Signals and Queries from workflows. Signals and Queries need to be defined in `temporal/src/workflows.ts`

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

### Important notes for launching workflows:

It's possible to pass workflow as a function, it will work on dev but not on prod!!!

because there are completely different artifacts from next.js and temporal - it's really hard to match tem (if possible).

Moreover if we wat to use temporal worker from another services like Nest API, then we definitely should use string names of workflow.

TIP: passing function instead of string it may be helpful for dev because we have tape-safety then and editor suggests possible worker input params

✅ OK: string name for the workflow

```ts
const personHandle = await client.workflow.start('estimateAgeWorkflow', {
  taskQueue: TASK_QUEUE_NAME,
  workflowId: personWorkflowId,
  args: [{ name: 'Janina' }],
});
```

❌ WRONG

```ts
import { estimateAgeWorkflow } from '@/temporal/src/workflows';

const personHandle = await client.workflow.start(estimateAgeWorkflow, {
```

### How to test

You can launch the application and open route: `/api/run-workflow`.

Keep in mind that Next.js in version 13 and 14 tries cache everything what can and if you want to bet results using route handlers remember to set force dynamic:

```ts
export const dynamic = 'force-dynamic';
```

### Running locally

Local development is setup to use with Temporal Cloud. You need to provide env vars:

```
TEMPORAL_SERVER_ADDRESS=
TEMPORAL_NAMESPACE=
TEMPORAL_CERT=
TEMPORAL_KEY=
```

And run one of commands:

* All in one: `npm run dev:all`
* Run separately: `npm run dev`, `npm run start:worker`

### [Setup Temporal dev server locally](https://learn.temporal.io/getting_started/typescript/dev_environment/#set-up-a-local-temporal-service-for-development-with-temporal-cli)

Command to start temporal dev server:

```bash
temporal server start-dev
```

In production, we will probably use Temporal Cloud.

There is a new temporal directory and a couple of scripts

### Using docker

There is an example repo https://github.com/temporalio/docker-compose from which we can use docker compose files.

You can run (or use Temporal Cloud configuration)

```bash
cd temporal-server
docker compose up
```

to launch local dev server.

You alo need to run worker:

```bash
npm run start:worker
```

### Debugging using VSCode

You can use VSCode extension: https://www.youtube.com/watch?v=3IjQde9HMNY

