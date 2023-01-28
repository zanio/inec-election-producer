import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CronPuppeteerModule } from './cron-puppeteer/cron-puppeteer.module';
import { PuppeteerModule } from './puppeteer/puppeteer.module';
import { BullModule } from '@nestjs/bull';
import { RedisModule } from 'nestjs-redis';
import { configuration } from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      useFactory: (configService: ConfigService) => configService.get('redis3'), // or use async method
      //useFactory: async (configService: ConfigService) => configService.get('redis'),
      inject: [ConfigService],
    }),
    RedisModule.forRootAsync({
      useFactory: (configService: ConfigService) => configService.get('redis2'), // or use async method
      //useFactory: async (configService: ConfigService) => configService.get('redis'),
      inject: [ConfigService],
    }),
    PuppeteerModule,
    CronPuppeteerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
