import './instrument.js';
import { NestFactory, Reflector } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './common/filters/api-exception.filter.js';
import { ReplaceIdsInterceptor } from './common/interceptors/replace-ids.interceptor.js';
import { parseApiEnv } from './config/env.js';
import { loadLocalEnv } from './config/load-local-env.js';
import { getEncryptionStartupStatus } from '@ragenai/crypto';
import { PrismaService } from './prisma/prisma.service.js';
import { recordEncryptionBypassEvent } from './security/record-encryption-bypass-event.js';

async function bootstrap() {
  // Local files first, then validation — in that order, or a fresh clone
  // fails validation on variables that sit in the root .env.local. A no-op
  // wherever the variables arrive already set (see load-local-env.ts).
  loadLocalEnv();

  // Before NestFactory: a misconfigured service should say so in one legible
  // block rather than fail at the first request that needs the missing
  // variable, three layers into a provider (ADR-37). console, not the Nest
  // logger, because the logger belongs to an app that does not exist yet.
  const env = parseApiEnv();
  if (!env.ok) {
    console.error(env.report);
    process.exit(1);
  }

  // Encryption is required in a deployed environment — see
  // docs/thread-encryption.md. Checked before NestFactory.create() for the
  // same reason as the env parse above: a misconfigured service should say so
  // in one legible block rather than silently persist plaintext at the first
  // chat.
  const encryptionStatus = getEncryptionStartupStatus();
  if (encryptionStatus === 'blocked') {
    console.error(
      'Refusing to start: no encryption provider is configured. Set ' +
        'ENCRYPTION_PROVIDER ("scaleway", "kms" or "local") and its ' +
        'credentials, or set ALLOW_UNENCRYPTED=1 to explicitly opt out.',
    );
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule);

  if (encryptionStatus === 'bypassed') {
    await recordEncryptionBypassEvent(app.get(PrismaService));
  }
  const logger = new Logger('Bootstrap');
  const configService = app.get(ConfigService);

  // Global prefix: /v1
  app.setGlobalPrefix('v1');

  // CORS
  const corsOrigin = configService.get<string>('CORS_ORIGIN', '*');
  app.enableCors({
    origin: corsOrigin.split(','),
    methods: 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization,x-worker-secret',
  });

  // Global validation pipe (class-validator)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new ApiExceptionFilter());

  // Global response transformation (public_id → id). Controllers/handlers
  // annotated with @SkipResponseTransform() bypass this — used by
  // OpenAI-compatible endpoints that produce their own response shapes.
  app.useGlobalInterceptors(new ReplaceIdsInterceptor(app.get(Reflector)));

  // Swagger — enabled everywhere by default. The docs page is
  // read-only and the bearer-auth block is informational (keys are
  // issued in-dashboard), so there's no real exposure vs. hiding it
  // in prod. Set `SWAGGER_ENABLED=false` to turn it off.
  const swaggerEnabled =
    configService.get<string>('SWAGGER_ENABLED', 'true') !== 'false';
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Ragen API')
      .setDescription(
        [
          'Ragen AI public API — OpenAI-compatible chat completions, ' +
            'files, assistants, threads, and messages.',
          '',
          'Authenticate with your API key as a Bearer token: ' +
            '`Authorization: Bearer sk-<keyId>.<secret>`. Keys are ' +
            'scoped to an organization + project; operations act on ' +
            'the org unless noted otherwise.',
          '',
          'The OpenAI SDK drops in with a base URL override — see ' +
            'https://docs.ragen.ai/api-reference for examples.',
        ].join('\n'),
      )
      .setVersion('1.0')
      .setContact('Ragen AI', 'https://ragen.ai', 'support@ragen.ai')
      .addServer('https://api.ragen.ai/v1', 'Production')
      .addServer('http://localhost:3001/v1', 'Local development')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'sk-<keyId>.<secret>',
          description: 'Issued via Dashboard → Settings → API Keys.',
        },
        'bearer',
      )
      .addTag('Chat Completions', 'OpenAI-compatible chat completions')
      .addTag('Files', 'Upload, list, retrieve, delete knowledge-base files')
      .addTag('Assistants', 'Create and manage assistants (Ragen projects)')
      .addTag('Threads', 'Threads + messages (conversation storage)')
      .addTag(
        'Chat',
        'Ragen-native chat endpoint (pre-OpenAI-compat; for new integrations use Chat Completions)',
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    // Serve the raw OpenAPI JSON too — handy for codegen + tooling.
    SwaggerModule.setup('docs', app, document, {
      jsonDocumentUrl: 'docs/openapi.json',
    });
    logger.log(
      'Swagger docs at /v1/docs (OpenAPI JSON: /v1/docs/openapi.json)',
    );
  }

  const port = configService.get<number>('PORT', 3001);
  await app.listen(port);
  logger.log(`ragen-api running on port ${port}`);
}

bootstrap().catch((err) => {
  console.error('Failed to start application', err);
  process.exit(1);
});
