import {
  OnQueueActive,
  OnQueueCompleted,
  OnQueueFailed,
  Process,
  Processor,
} from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PuppeteerService } from './puppeteer.service';
import { IJobWardCrawler } from '../Types';

@Injectable()
@Processor('WARD_QUEUE')
export class WardPuppeteerProcessor {
  private readonly logger = new Logger(WardPuppeteerProcessor.name);
  constructor(private readonly puppeteerService: PuppeteerService) {}

  @OnQueueFailed()
  onError(job: Job<any>, error: any) {
    this.logger.error(
      `Failed job ${job.id} of type ${job.name}: ${error.message}`,
      error.stack,
    );
  }
  @OnQueueActive()
  onActive(job: Job) {
    this.logger.debug(
      `Processing job ${job.id} of type ${job.name}. Data: ${JSON.stringify(
        job.data,
      )}`,
    );
  }

  @OnQueueCompleted()
  async onCompleted(job: Job, result: any) {
    this.logger.debug(
      `Completed job ${job.id} of type ${job.name}. Result: ${JSON.stringify(
        result,
      )}`,
    );
  }

  @Process({ name: 'wardLinkProcessor', concurrency: 1 })
  async handleProcessWardLink(job: Job<IJobWardCrawler>) {
    this.logger.log('PuppeteerProcessor.handleProcessWardLink starting...');
    const { link } = job.data;
    await this.puppeteerService.processWardLink(link);
    this.logger.log('PuppeteerProcessor.handleProcessWardLink done...');
  }
}
