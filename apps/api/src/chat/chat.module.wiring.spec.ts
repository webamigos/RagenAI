import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module.js';
import { ChatService } from './chat.service.js';
import { ChatController } from './chat.controller.js';

/**
 * Full-graph DI wiring smoke test for the /v1/chat cutover (see
 * docs/adrs/21-monorepo-and-api-decoupling.md, Phase B). `nest build`
 * type-checks constructor parameter types but never verifies the actual
 * NestJS dependency-injection graph (missing providers, module import
 * gaps) — that's only checked at module compile/bootstrap time. This is
 * the first test in this codebase to compile the real AppModule end to
 * end, since ChatModule now pulls together every RAG-engine module ported
 * across all of Phase B for the first time.
 *
 * Only `.compile()` is called, never `.init()` — that's enough to resolve
 * every provider in the graph without triggering `OnModuleInit` hooks
 * (e.g. PrismaService's real DB `$connect()`), so this needs no live
 * database, LiteLLM, Qdrant, or vault connection.
 */
describe('AppModule (full DI graph wiring)', () => {
  const originalEnv = { ...process.env };

  beforeAll(() => {
    // Self-contained: don't rely on a local .env.local (this must also
    // pass in CI, which has none). Only providers whose *constructor*
    // calls ConfigService.getOrThrow need a value here — onModuleInit-time
    // reads (VaultClient) and per-request reads (RagenAppClient) never
    // fire during .compile() alone.
    process.env.DATABASE_URL ??=
      'postgresql://postgres:postgres@localhost:5432/ragen_test';
    process.env.SESSION_AUTH_SECRET ??= 'test-session-auth-secret';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('compiles the whole app and resolves ChatService/ChatController', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef.get(ChatService)).toBeInstanceOf(ChatService);
    expect(moduleRef.get(ChatController)).toBeInstanceOf(ChatController);

    await moduleRef.close();
  });
});
