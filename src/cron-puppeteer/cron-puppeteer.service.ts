import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression, Timeout } from '@nestjs/schedule';
import { PuppeteerService } from '../puppeteer/puppeteer.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CronPuppeteerService {
  private readonly logger = new Logger(CronPuppeteerService.name);
  constructor(private readonly puppeteerService: PuppeteerService) {}

  @Timeout(15000) // this would run every 5 minutes
  async runPuppeteerEvery3Minute() {
    /**
     * Start the puppeteer browser and login to the website, get the homepage information content and get all links. Push the links to  a new job queue, with the page object. This task will run
     * every 1 seconds, picks up all the links and open the ward links and crawl all the ward links data and send it to the next job queue. This job queue will run every 2 minutes.
     * It would get all the ward links go to those ward link ( pulling unit ) and perform a click on each pulling unit.
     */
    const time = new Date();
    console.log(`Cron start time ${time.getMinutes()}:${time.getSeconds()}`);
    await this.puppeteerService.initialize();
    const time2 = new Date();
    this.logger.debug(
      `Cron ran in ${time2.getTime() - time.getTime()} seconds`,
    );
    this.logger.debug('Every 10 seconds from runEvery10Seconds');
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  handleRefreshWardLinkCron() {
    this.logger.debug('Called when the current second is 3');
    this.puppeteerService.refreshDoneWardLinks();
  }
}
