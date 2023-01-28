import { Module } from '@nestjs/common';
import { CronPuppeteerService } from './cron-puppeteer.service';
import { PuppeteerService } from '../puppeteer/puppeteer.service';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'LGA_CRAWLER_QUEUE',
    }),
    BullModule.registerQueue({
      name: 'PDF_QUEUE',
    }),
    BullModule.registerQueue({
      name: 'WARD_QUEUE',
    }),
  ],
  providers: [CronPuppeteerService, PuppeteerService, ConfigService],
})
export class CronPuppeteerModule {}
