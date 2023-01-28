import { Module } from '@nestjs/common';
import { PuppeteerService } from './puppeteer.service';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { PuppeteerProcessor } from './puppeteer.processor';
import { PdfPuppeteerProcessor } from './pdf.processor';
import { IdemRedisService } from './idemPotency.service';
import { WardPuppeteerProcessor } from './ward.processor';

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
  providers: [
    PuppeteerService,
    ConfigService,
    PuppeteerProcessor,
    PdfPuppeteerProcessor,
    WardPuppeteerProcessor,
    IdemRedisService,
  ],
  exports: [PuppeteerService],
})
export class PuppeteerModule {}
