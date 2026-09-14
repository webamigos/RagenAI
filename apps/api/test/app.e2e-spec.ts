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
        onModuleInit: jest.fn(),
        storeToken: jest.fn(),
        retrieveToken: jest.fn().mockResolvedValue(null),
        deleteToken: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
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
