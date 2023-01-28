import { Module } from '@nestjs/common';
import { CronPuppeteerService } from './cron-puppeteer.service';
import { PuppeteerService } from '../puppeteer/puppeteer.service';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { IdemRedisService } from 'src/puppeteer/idemPotency.service';
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
    CronPuppeteerService,
    PuppeteerService,
    ConfigService,
    IdemRedisService,
  ],
})
export class CronPuppeteerModule {}
