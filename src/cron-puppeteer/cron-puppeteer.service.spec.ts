import { Test, TestingModule } from '@nestjs/testing';
import { CronPuppeteerService } from './cron-puppeteer.service';

describe('CronPuppeteerService', () => {
  let service: CronPuppeteerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CronPuppeteerService],
    }).compile();

    service = module.get<CronPuppeteerService>(CronPuppeteerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
