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
        const isLocal = configService.get('TARGET_ENV') === 'local';
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
        const mult = isLocal ? 1.5 : 1;
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
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
