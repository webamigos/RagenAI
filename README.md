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

