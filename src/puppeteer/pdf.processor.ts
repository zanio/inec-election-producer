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
import { IdemRedisService } from './idemPotency.service';

@Injectable()
@Processor('PDF_QUEUE')
export class PdfPuppeteerProcessor {
  private readonly logger = new Logger(PdfPuppeteerProcessor.name);
  constructor(
    private readonly puppeteerService: PuppeteerService,
    private readonly idemRedisService: IdemRedisService,
  ) {}

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

  @Process({ name: 'CrawlPdf', concurrency: 1 })
  async handleCrawlPdf(job: Job<IJobWardCrawler>) {
    // let isLocked = false;
    // try {
    //   isLocked = await this.idemRedisService.lockProcess(
    //     'pdfwardCrawler',
    //     'pdfwardCrawler',
    //   );
    // } catch (e) {
    //   this.logger.error(`Failed to lockProcess`);
    //   throw e;
    // }
    // if (!isLocked) {
    //   this.logger.error(`A job already obtained the lock...`);
    // }
    this.logger.log('PuppeteerProcessor.handleCrawlPdf starting...');
    const { link } = job.data;
    await this.puppeteerService.getPdfLink(link);
    this.logger.log('PuppeteerProcessor.handleCrawlPdf done...');
    // await this.idemRedisService.unlockProcess('wardCrawler');
  }
}
