import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module.js';
import { VaultModule } from './vault/vault.module.js';
import { CommonModule } from './common/common.module.js';
import { HealthcheckModule } from './healthcheck/healthcheck.module.js';
import { ChatModule } from './chat/chat.module.js';
import { ChatCompletionsModule } from './chat-completions/chat-completions.module.js';
import { FilesModule } from './files/files.module.js';
import { AssistantsModule } from './assistants/assistants.module.js';
import { ThreadsModule } from './threads/threads.module.js';
import { RagEngineModule } from './rag-engine/rag-engine.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { MessagesModule } from './messages/messages.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { AuditLogsModule } from './audit-logs/audit-logs.module.js';
import { SubscriptionsModule } from './subscriptions/subscriptions.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const targetEnv = configService.get<string>('TARGET_ENV');
        const isLocal = targetEnv === 'local';
        // The e2e suite drives 150+ specs from a single IP, so production
        // limits throttle it into failure: the sidebar's Server Action got a
        // 429 and rendered an empty thread list, failing a P0 spec for
        // reasons unrelated to the code under test. Kept enabled rather than
        // switched off so a runaway request loop would still trip it.
        const isAutomatedTest = targetEnv === 'ci' || targetEnv === 'test';
        // Three named throttlers. Routes inherit `default` unless a
        // handler overrides with `@Throttle({ cheap: {...} })` or
        // `@Throttle({ expensive: {...} })`.
        //
        // Rationale:
        // - cheap      read-only flat Prisma lookups (get-by-id on
        //              small rows)
        // - default    routine CRUD (list/get/create/update/delete on
        //              threads/messages/assistants/files)
        // - expensive  LLM-hitting (chat completions) or S3/Temporal
        //              pipelines (file uploads) — real cost per call
        let mult = 1;
        if (isAutomatedTest) {
          mult = 100;
        } else if (isLocal) {
          mult = 1.5;
        }
        return {
          throttlers: [
            {
              name: 'cheap',
              ttl: 60_000,
              limit: Math.round(60 * mult),
            },
            {
              name: 'default',
              ttl: 60_000,
              limit: Math.round(20 * mult),
            },
            {
              name: 'expensive',
              ttl: 60_000,
              limit: Math.round(10 * mult),
            },
          ],
        };
      },
    }),
    PrismaModule,
    VaultModule,
    CommonModule,
    HealthcheckModule,
    ChatModule,
    ChatCompletionsModule,
    FilesModule,
    AssistantsModule,
    ThreadsModule,
    RagEngineModule,
    NotificationsModule,
    MessagesModule,
    ProjectsModule,
    AuditLogsModule,
    SubscriptionsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
