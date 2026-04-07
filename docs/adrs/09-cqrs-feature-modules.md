# ADR-09: CQRS Feature Modules

**Status:** Accepted
**Date:** 2025-03-01

## Context

As the application grew, domain logic was scattered across server actions, API route handlers, and utility files. This made it hard to find business logic, led to duplication, and mixed read/write concerns.

## Decision

Organize domain logic into **feature modules** under `src/features/` following a CQRS (Command Query Responsibility Segregation) pattern:

```
features/{feature}/
├── contracts/          # Types, DTOs, schemas, enums
├── constants/          # Feature-specific constants
├── services/
│   ├── queries/        # Read operations — named get*Query()
│   └── commands/       # Write operations — named *Command()
└── utils/              # Feature-specific utilities
```

### Current Modules

`assistants`, `connectors`, `documents`, `messages`, `onboarding`, `organizations`, `projects`, `subscriptions`, `threads`, `users`

### Conventions

- Queries return data directly; commands return results or `OperationResult<T>`
- Import types from `@/features/{feature}/contracts/`
- Import business logic from `@/features/{feature}/services/`
- Server actions (`src/app/actions/index.ts`) delegate to feature commands/queries
- New domain logic goes in `src/features/`, not in actions files

## Consequences

- Clear separation of reads and writes makes code easier to reason about
- Feature modules are self-contained — contracts, logic, and utils co-located
- Server actions become thin auth + delegation wrappers
- Slight overhead for simple CRUD — even a one-liner query gets its own file
