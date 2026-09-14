import { Test, type TestingModule } from '@nestjs/testing';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type Server } from 'node:http';
import { AppModule } from './../src/app.module.js';
import { VaultClient } from './../src/vault/vault.client.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<Server>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(VaultClient)
      .useValue({
        onModuleInit: vi.fn(),
        storeToken: vi.fn(),
        retrieveToken: vi.fn().mockResolvedValue(null),
        deleteToken: vi.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    // `createNestApplication()` does not replay `main.ts`'s bootstrap, so the
    // global prefix every route actually lives under has to be set here too.
    // Without it this suite asked for `/v1/healthcheck` and got a 404 — it has
    // been failing that way under jest as well, unnoticed because nothing in
    // CI runs it.
    app.setGlobalPrefix('v1');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/v1/healthcheck (GET)', () => {
    return request(app.getHttpServer())
      .get('/v1/healthcheck')
      .expect(200)
      .expect({ status: 'ok' });
  });
});
