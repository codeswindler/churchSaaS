import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('should expose a health payload', () => {
    const health = appController.getHealth();
    expect(health.status).toBe('ok');
    expect(health.service).toBe('church-management-saas');
    expect(health.timestamp).toBeDefined();
  });
});
