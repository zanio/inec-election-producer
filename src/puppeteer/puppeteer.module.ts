import { Module } from '@nestjs/common';
import { PuppeteerService } from './puppeteer.service';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { PuppeteerProcessor } from './puppeteer.processor';
import { PdfPuppeteerProcessor } from './pdf.processor';
import { IdemRedisService } from './idemPotency.service';
import { WardPuppeteerProcessor } from './ward.processor';
import { ClientsModule, Transport } from '@nestjs/microservices';

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
    ClientsModule.register([
      {
        name: 'PDF_INEC_MICROSERVICE',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'pdf-inec-microservice',
            brokers: ['localhost:29092'],
          },
          // producerOnlyMode: true,
          consumer: {
            groupId: 'pdf-inec-consumer',
          },
        },
      },
    ]),
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
