import { Test, type TestingModule } from '@nestjs/testing';
import { HealthcheckController } from './healthcheck.controller';

describe('HealthcheckController', () => {
  let controller: HealthcheckController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthcheckController],
    }).compile();

    controller = module.get(HealthcheckController);
  });

  it('should return { status: "ok" }', () => {
    expect(controller.check()).toEqual({ status: 'ok' });
  });
});
