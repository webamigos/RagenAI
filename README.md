# Ragen AI

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

## API mode

To run Ragen in API mode set env variable:

`IS_API_MODE=1`

Then all url's will be rewrited to /api

Example: `http://localhost:3000/api/v1/healthcheck` -> `http://localhost:3000/v1/healthcheck`

The purpose is to decouple API to new instance and use URLs: `https://api.ragen.io/v1/healthcheck`

## Working with Temporal

Temporal is a great tool for managing async tasks without the complexity of managing queues and architecture. I allow easily testing and maintaining distributed architecture. One workflow can be used by many apps.

We can use it for:
* Document processing workflow
* File upload process
* Creating organization with numeric ID
* Send mails to users on defined interval (e.g. sequence of onboarding e-mails with every three days in first 10 days)
* End free trial after 14 days
* Exchange events between backend events (separate project/repo)

Ragen is using Temporal and Workflow from this repository: https://github.com/WebAmigos/ragen-worker

You can find there instructions how to run temporal locally and how to run worker.

### Important notes for launching workflows:

✅ OK: string name for the workflow

```ts
const personHandle = await client.workflow.start('estimateAgeWorkflow', {
  taskQueue: TASK_QUEUE_NAME,
  workflowId: personWorkflowId,
  args: [{ name: 'Janina' }],
});
```

❌ WRONG - do not create workflows in Ragen app

```ts
import { estimateAgeWorkflow } from '@/temporal/src/workflows';

const personHandle = await client.workflow.start(estimateAgeWorkflow, {
```

⚠️ Moreover after changing activity name Temporal cloud still uses activity old name (estimateAge) but not each time 🤦

Temporal solution for Temporal is to create new workflow name.

### How to test

You can launch the application and open route: `/api/run-workflow`.

Keep in mind that Next.js in version 13 and 14 tries cache everything what can and if you want to bet results using route handlers remember to set force dynamic:

```ts
export const dynamic = 'force-dynamic';
```

### Running locally

See: https://github.com/WebAmigos/ragen-worker
