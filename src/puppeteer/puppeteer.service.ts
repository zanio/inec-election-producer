import { Injectable, Logger } from '@nestjs/common';
import { CheerioPage } from '../util/CheerioPage';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bull';
import * as Redis from 'ioredis';
import { InjectQueue } from '@nestjs/bull';
import { Browser, launch, Page } from 'puppeteer';
import { Guard } from '../Types';
import * as _ from 'lodash';
import { RedisService } from 'nestjs-redis';
@Injectable()
export class PuppeteerService {
  private readonly logger = new Logger(PuppeteerService.name);

  BASE_URL: string;
  EMAIL: string;
  PASSWORD: string;

  INDEX_PAGE_LINK_NAME: string;

  STATE_ELECTION_LINK_NAME: string;

  browserPromise: Promise<Browser>;

  redis: Redis.Redis;

  puppeteerOption = {
    headless: true,
    args: [
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-setuid-sandbox',
      '--no-first-run',
      '--no-sandbox',
      '--no-zygote',
      '--shm-size=3gb',
      '--deterministic-fetch',
      '--disable-features=IsolateOrigins',
      '--disable-site-isolation-trials',
      // '--single-process',
    ],
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    @InjectQueue('LGA_CRAWLER_QUEUE')
    private readonly lgaQueue: Queue,

    @InjectQueue('PDF_QUEUE')
    private readonly pdfLinkQueue: Queue,
    @InjectQueue('WARD_QUEUE')
    private readonly wardLinkQueue: Queue,
  ) {
    this.BASE_URL = this.configService.get<string>('BASE_URL');
    this.EMAIL = this.configService.get<string>('EMAIL');
    this.PASSWORD = this.configService.get<string>('PASSWORD');
    this.INDEX_PAGE_LINK_NAME = this.configService.get<string>(
      'INDEX_PAGE_LINK_NAME',
    );
    this.STATE_ELECTION_LINK_NAME = this.configService.get<string>(
      'STATE_ELECTION_LINK_NAME',
    );
    this.browserPromise = launch(this.puppeteerOption);
    this.redis = this.redisService.getClient(
      this.configService.get('REDIS_NAME'),
    );
  }

  async initialize(): Promise<void> {
    const redisKey = 'puppeteer:path:wardLinks:total';
    const redisValue = await this.redis.get(redisKey);
    const wardLinks = JSON.parse(redisValue);
    if (_.isEmpty(wardLinks)) {
      this.logger.log('PuppeteerService.initialize wardLinks is empty');
      await this.startPageCrawlingFromLga();
    } else {
      this.logger.log('PuppeteerService.initialize wardLinks is not empty');
    }
  }

  async refreshDoneWardLinks(): Promise<void> {
    const redisKey = 'puppeteer:path:wardLinks:total';
    const redisValue = await this.redis.get(redisKey);
    const wardLinks = JSON.parse(redisValue);
    const completedWards = wardLinks?.filter((ward) => ward.done);
    if (!_.isEmpty(wardLinks) && !_.isEmpty(completedWards)) {
      this.logger.log(
        'PuppeteerService.refreshDoneWardLinks refreshing completed wards for new updload check',
      );
      const updateWardLinks = wardLinks.map((ward) => ({
        ...ward,
        done: false,
      }));
      await this.redis.set(redisKey, JSON.stringify(updateWardLinks));
      await this.distributeLoadForPdfGenerator(completedWards);
    } else {
      this.logger.log(
        'PuppeteerService.refreshDoneWardLinks, no wards queu has been completed',
      );
    }
  }

  /**
   *
   */
  async startPageCrawlingFromLga() {
    this.logger.log('PuppeteerService.startPageCrawlingFromLga runPuppeteer');

    const browser = await this.browserPromise;
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 720 });
    await this.login(page);
    const homePageLink = await this.getHomePageLink(page, Guard.Root);
    const governorElectionLinks = (await this.crawlUrl(
      page,
      homePageLink,
    )) as Record<string, string>[];
    const singleStateLink = this.findLink(
      governorElectionLinks,
      this.STATE_ELECTION_LINK_NAME,
    );
    const lgaLinks = (await this.crawlUrl(
      page,
      singleStateLink,
      Guard.LGA,
    )) as Record<string, string>[];
    this.logger.log(
      `The lga available on ${this.STATE_ELECTION_LINK_NAME} ${JSON.stringify(
        lgaLinks,
      )} and size ${lgaLinks.length}`,
    );
    await this.bulkAddOfLgaToQueue(lgaLinks);
  }

  async bulkAddOfLgaToQueue(links: Record<string, string>[]): Promise<void> {
    for (const link of _.take(links, 1)) {
      await this.lgaQueue.add(
        'wardCrawler',
        {
          link,
        },
        {
          removeOnFail: true,
          attempts: 2,
        },
      );
    }
  }

  public async processLgaLink(link: Record<string, string>) {
    const browser = await this.browserPromise;
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1200, height: 720 });

      await this.login(page);

      const wardLinks = (await this.crawlUrl(
        page,
        link['href'],
        Guard.PU,
      )) as Record<string, string>[];
      const redisKey = 'puppeteer:path:wardLinks';
      const redisValue = await this.redis.get(redisKey);
      let total = [];
      if (_.isEmpty(redisValue)) {
        total = [...wardLinks];
        await this.redis
          .multi()
          .del(redisKey)
          .set(
            redisKey,
            JSON.stringify([{ wardLinks, path: link['text'] }]),
            'EX',
            60 * 60 * 4,
          )
          .exec();
      } else {
        const pathToWardLinksFromRedis = JSON.parse(
          await this.redis.get(redisKey),
        );
        const pathToWardLink = _.find(pathToWardLinksFromRedis, {
          path: link['text'],
        });

        total = _.flatten(pathToWardLinksFromRedis.map((e) => e.wardLinks));
        if (!_.isEmpty(pathToWardLink)) {
          const wardLinksFromRedis = pathToWardLink['wardLinks'];
          const updatedWardLinks = _.concat(
            wardLinks,
            wardLinksFromRedis,
          ) as Record<string, string>[];
          const totalWardLinks = _.uniqBy(updatedWardLinks, 'href');
          total = [...total, ...totalWardLinks];
          const newPathToWardLinks = {
            wardLinks: totalWardLinks,
            path: link['text'],
          };
          const itemToPush = _.uniqBy(
            [...pathToWardLinksFromRedis, newPathToWardLinks],
            'path',
          );
          await this.redis
            .multi()
            .del(redisKey)
            .set(redisKey, JSON.stringify(itemToPush), 'EX', 60 * 60 * 4)
            .exec();
        } else {
          const itemToPush = _.uniqBy(
            [...pathToWardLinksFromRedis, { wardLinks, path: link['text'] }],
            'path',
          );
          await this.redis
            .multi()
            .del(redisKey)
            .set(redisKey, JSON.stringify(itemToPush), 'EX', 60 * 60 * 4)
            .exec();

          total = _.concat(wardLinks, total);
        }
      }

      const uniqTotal = _.uniqBy(total, 'href');
      const modifyTotalSchema = uniqTotal.map((m) => ({
        ...m,
        done: false,
        puCount: null,
        index: 0,
        range: [],
      }));
      const redisWardKey = 'puppeteer:path:wardLinks:total';
      await this.redis
        .multi()
        .del(redisWardKey)
        .set(redisWardKey, JSON.stringify(modifyTotalSchema))
        .exec();
      this.logger.log(`A total of  ${total.length} ward links added to redis`);
    } catch (e) {
      this.logger.error('PuppeteerService processLgaLink error', e);
    } finally {
      // await page.close();
      // await browser.close();
      this.logger.log('PuppeteerService processWardAndGetPdfLink page closed');
    }
  }

  async onLgaProcessJobsCompleted() {
    const redisKey = 'puppeteer:path:wardLinks:total';
    const redisValue = await this.redis.get(redisKey);
    const wardLinks = JSON.parse(redisValue);
    const completedJobCount = await this.lgaQueue.getCompletedCount();
    const redisLgaKey = 'puppeteer:path:wardLinks';
    const allLgaWard = JSON.parse(await this.redis.get(redisLgaKey));

    const LgaKeys = allLgaWard.map((it) => it['path']);
    // console.log(completedJobCount, LgaKeys, allLgaWard);
    // this would only run the first time
    if (completedJobCount === LgaKeys.length) {
      this.logger.log(`Begin wardLinkQueue job`);
      await this.distributeLoadForWard(wardLinks);
    }
  }

  /**
   * Returns all polling unit buttons and click on each button
   * @param links
   * @param page
   */
  async distributeLoadForWard(links: Record<string, string>[]) {
    for (const link of links) {
      await this.wardLinkQueue.add(
        'wardLinkProcessor',
        {
          link,
        },
        {
          removeOnFail: true,
          attempts: 2,
        },
      );
    }
  }

  async distributeLoadForPdfGenerator(links: Record<string, string>[]) {
    for (const link of links) {
      await this.pdfLinkQueue.add(
        'CrawlPdf',
        {
          link,
        },
        {
          removeOnFail: true,
          attempts: 2,
        },
      );
    }
  }

  public async processWardLink(link: Record<string, string>) {
    const browser = await this.browserPromise;
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1200, height: 720 });
      await this.login(page);
      // Go to the target website
      const fullUrl = this.BASE_URL + link['href'];

      await page.goto(fullUrl, { waitUntil: 'load', timeout: 10000 }); // wait until page load
      await this.waitTillHTMLRendered(page);

      const items = await page.$$('.btn-success');
      const totalButtons = items.length;
      this.logger
        .log(`The number of polling unit is ${totalButtons} and the items are
       ${JSON.stringify(
         items,
       )} pulling unit full url is ${fullUrl} and the ward name is ${
        link['text']
      } the page url is ${await page.url()}`);

      // if items.length is 0 and the page url is correct then the something was wrong,
      // so we need to add the link to the queue again
      if (totalButtons === 0 && fullUrl.includes('/context/pus/lga')) {
        await this.wardLinkQueue.add(
          'wardLinkProcessor',
          {
            link,
          },
          {
            removeOnComplete: true,
            removeOnFail: true,
            attempts: 2,
          },
        );
        return;
      }
      const redisWardKey = 'puppeteer:path:wardLinks:total';
      const updatedLink = {
        ...link,
        puCount: totalButtons,
        index: 0,
        range: [...Array(totalButtons).keys()],
      };
      const redisWardItems = JSON.parse(await this.redis.get(redisWardKey));
      if (!_.isEmpty(redisWardItems)) {
        const findLink = _.find(redisWardItems, { href: link['href'] });
        const filterRedisValue = redisWardItems.filter(
          (el) => el.href !== link['href'],
        );
        if (findLink) {
          await this.redis
            .multi()
            .del(redisWardKey)
            .set(
              redisWardKey,
              JSON.stringify([...filterRedisValue, updatedLink]),
            )
            .exec();

          await this.pdfLinkQueue.add(
            'CrawlPdf',
            {
              link: { ...updatedLink },
            },
            {
              removeOnComplete: true,
              removeOnFail: true,
              attempts: 2,
            },
          );
        }
      }
    } catch (e) {
      this.logger.error('PuppeteerService processWardLink error', e);
    } finally {
      // await page.close();
      this.logger.log('PuppeteerService processWardLink done');
    }
  }

  public async getPdfLink(link: Record<string, string>) {
    const browser = await this.browserPromise;
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1200, height: 720 });
      await this.login(page);
      // Go to the target website
      const fullUrl = this.BASE_URL + link['href'];

      await page.goto(fullUrl, { waitUntil: 'load', timeout: 10000 }); // wait until page load
      await this.waitTillHTMLRendered(page);

      const items = await page.$$('.btn-success');
      this.logger.debug(`getPdfLink The number of polling unit is ${
        items.length
      } and the items are
       ${JSON.stringify(
         items,
       )} pulling unit full url is ${fullUrl} and the ward name is ${
        link['text']
      } the page url is ${await page.url()}`);

      // if items.length is 0 and the page url is correct then the something was wrong,
      // so we need to add the link to the queue again
      if (items.length === 0 && fullUrl.includes('/context/pus/lga')) {
        await this.pdfLinkQueue.add(
          'CrawlPdf',
          {
            link,
          },
          {
            removeOnComplete: true,
            removeOnFail: true,
            attempts: 2,
          },
        );
        return;
      }
      const redisWardKey = 'puppeteer:path:wardLinks:total';
      const oldLink = await this.findWardLinkFromRedis(
        link['href'],
        redisWardKey,
      );
      console.log('oldLink', oldLink);
      if (!_.isEmpty(oldLink)) {
        const totalButonsItems = items.length;
        const newIndexInc = oldLink.index + 1;
        const range = [...Array(totalButonsItems).keys()];
        const oldIndex = range[oldLink.index];
        if (items[oldIndex]) {
          let newUpdatedWarkLink = {};
          if (oldIndex < totalButonsItems) {
            await Promise.all([
              page.evaluate(async (element) => {
                // @ts-ignore
                await element.click();
              }, items[oldIndex]),
              page.waitForNetworkIdle({ timeout: 10000 }),
              this.waitTillHTMLRendered(page),
            ]);
            const html = await page.content();
            const pdfLink = this.handlePageScrapingForPdfLink(html, '.pdf');
            this.logger.log(`The pdf links are ${pdfLink}`);
            // send link to kafka
            await Promise.all([
              page.goBack(),
              page.waitForNavigation({
                waitUntil: 'networkidle0',
                timeout: 10000,
              }),
              this.waitTillHTMLRendered(page),
            ]);
            const newIndex = newIndexInc;
            newUpdatedWarkLink = {
              ...oldLink,
              puCount: items.length,
              index: newIndex,
              done: newIndex === totalButonsItems,
              range: [...Array(items.length).keys()],
            };
            await this.findWardLinkFromRedisAndUpdate(
              link['href'],
              redisWardKey,
              newUpdatedWarkLink,
            );
            console.log('newUpdatedWarkLink', newUpdatedWarkLink);
            // add the next link to the queue
            await this.pdfLinkQueue.add(
              'CrawlPdf',
              {
                link: newUpdatedWarkLink,
              },
              {
                removeOnComplete: true,
                removeOnFail: true,
                attempts: 2,
              },
            );
          }
          // else {
          //   newUpdatedWarkLink = {
          //     ...oldLink,
          //     puCount: items.length,
          //     index: newIndexInc,
          //     range: [...Array(items.length).keys()],
          //     done: true,
          //   };
          // }

          // remove ward link from redis
          // when all polling unit link is removed from redis then create a new redis sub key ( cycleCount )
          // For the next run, if(cycleCount !== 0) then get all the ward link with their
          // polling unit count from redis, if this values equal the fetched ward link and pu count
          // then skip that ward link and continue to the next ward link
          //  get all completed cycle ward link from redis and only watch that are completed by recalling this method
          // const wardLinks = JSON.parse(await this.redis.get(redisWardKey));
          // const findOneLinkFromRedis = _.find(wardLinks, {
          //   href: link['href'],
          // });
          // if (!_.isEmpty(wardLinks) && findOneLinkFromRedis) {
          //   const updateWardLinks = wardLinks.filter(
          //     (e) => e.href !== findOneLinkFromRedis['href'],
          //   );
          //   await this.redis.del(redisWardKey);
          //   await this.redis.set(redisWardKey, JSON.stringify(updateWardLinks));
          //   if (updateWardLinks.length === 0) {
          //     await this.redis.del(redisWardKey);
          //     const cycleCount = 'cycleCount';
          //     const counts = JSON.parse(await this.redis.get(cycleCount));
          //     if (counts) {
          //       const updatedCount = counts + 1;
          //       await this.redis.del(cycleCount);
          //       await this.redis.set(
          //         cycleCount,
          //         JSON.stringify({ count: updatedCount }),
          //       );
          //     } else {
          //       await this.redis.del(cycleCount);
          //       await this.redis.set('cycleCount', JSON.stringify(1));
          //     }
          //   }
          // }
        }
      }
    } catch (e) {
      this.logger.error('PuppeteerService getPdfLink error', e);
    } finally {
      await page.close();
      this.logger.log('PuppeteerService getPdfLink page closed');
    }
  }

  /**
   *
   * @param html
   * @param url
   * @param guardType
   */
  handlePageScraping(
    html: string,
    guardType?: string,
  ): Record<string, string>[] {
    return CheerioPage.createNewInstance(html, guardType).crawlPageLinks();
  }

  handlePageScrapingForPdfLink(html: string, guardType?: string): string[] {
    return CheerioPage.createNewInstance(html, guardType).crawlPagePdLinks();
  }

  /**
   *
   * @param page
   * @private
   */
  private async login(page: Page): Promise<Page> {
    try {
      const redisKey = 'puppeteer:login';
      const redisValue = await this.redis.get(redisKey);
      await page.goto(this.BASE_URL, {
        waitUntil: 'networkidle0',
        timeout: 10000,
      }); // wait until page load
      await this.waitTillHTMLRendered(page);
      if (!redisValue) {
        await page.type("input[name='email']", this.EMAIL);
        await page.type("input[name='password']", this.PASSWORD);
        await Promise.all([
          page.click("button[type='submit']"),
          page.waitForNavigation({ waitUntil: 'load', timeout: 10000 }),
          this.waitTillHTMLRendered(page),
        ]);
        const localStorageData = await page.evaluate(() => {
          const json = {};
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            json[key] = localStorage.getItem(key);
          }
          return json;
        });
        //  From observation, it takes aproximately 300 seconds for the token generated from inecResult site to expire
        await this.redis.set(
          redisKey,
          JSON.stringify(localStorageData),
          'EX',
          300,
        );
        this.logger.log(
          `Logging in for the first time and creating a new sub key in redis`,
        );
      } else {
        const localStorageData = JSON.parse(redisValue);
        await page.evaluate((values) => {
          for (const key in values) {
            let value = values[key];
            if (typeof value === 'object') {
              value = JSON.stringify(value);
            }
            localStorage.setItem(key, value);
          }
        }, localStorageData);
        await page.goto(this.BASE_URL + '/elections/types', {
          waitUntil: 'networkidle0',
          timeout: 10000,
        }); // wait until page load
        await this.waitTillHTMLRendered(page);
        this.logger.log(`Logging in from redis`);
      }
      this.logger.log('PuppeteerService login success');
      return page;
    } catch (e) {
      this.logger.error(
        `before timeout error was thrown PuppeteerService login error
        ${await page.url()}`,
      );
      await page.screenshot({ path: 'example.png' });
      this.logger.error('PuppeteerService login error', e);
    }
  }

  private async crawlUrl(
    page: Page,
    url: string,
    guardType?: string,
    handler: (
      html: string,
      guardType?: string,
    ) => Record<string, string>[] | string[] = this.handlePageScraping,
  ): Promise<Record<string, string>[] | string[]> {
    const fullUrl = this.BASE_URL + url;
    await page.goto(fullUrl, { waitUntil: 'networkidle2', timeout: 10000 }); // wait until page load
    await this.waitTillHTMLRendered(page);
    this.logger.log(
      `[fullUrl -> ${fullUrl} ] -- [page.url --> ${await page.url()}]`,
    );
    const html = await page.content();
    return handler(html, guardType);
  }

  private async getHomePageLink(page: Page, guardTyp: string): Promise<string> {
    const html = await page.content();
    const links = this.handlePageScraping(html, guardTyp);
    return this.findLink(links, this.INDEX_PAGE_LINK_NAME);
  }
  private findLink(links: Record<string, string>[], linkName: string): string {
    const link = links.find((el) => el['text'] === linkName);
    if (link) {
      return link['href'];
    }
    this.logger.warn('PuppeteerService findLink link not found');
    return '';
  }

  waitTillHTMLRendered = async (page: Page, timeout = 30000) => {
    const checkDurationMsecs = 1000;
    const maxChecks = timeout / checkDurationMsecs;
    let lastHTMLSize = 0;
    let checkCounts = 1;
    let countStableSizeIterations = 0;
    const minStableSizeIterations = 3;

    while (checkCounts++ <= maxChecks) {
      const html = await page.content();
      const currentHTMLSize = html.length;

      const bodyHTMLSize = await page.evaluate(
        () => document.body.innerHTML.length,
      );

      if (lastHTMLSize != 0 && currentHTMLSize == lastHTMLSize)
        countStableSizeIterations++;
      else countStableSizeIterations = 0; //reset the counter

      if (countStableSizeIterations >= minStableSizeIterations) {
        this.logger.log('Page rendered fully..');
        break;
      }

      lastHTMLSize = currentHTMLSize;
      // await new Promise(r => setTimeout(r, checkDurationMsecs))
      await page.waitForTimeout(checkDurationMsecs);
    }
  };

  private async findWardLinkFromRedisAndUpdate(
    link: string,
    key: string,
    newValue: Record<string, string>,
  ) {
    const redisKey = `${key}`;
    const redisValue = await this.redis.get(redisKey);
    if (!_.isEmpty(redisValue)) {
      const parsedValue = JSON.parse(redisValue);
      const response = _.find(parsedValue, { href: link });
      if (response) {
        const filterRedisValue = parsedValue.filter((el) => el.href !== link);
        await this.redis
          .multi()
          .del(redisKey)
          .set(
            redisKey,
            JSON.stringify([...filterRedisValue, { ...response, ...newValue }]),
          )
          .exec();
      }
    }
  }

  private async findWardLinkFromRedis(link: string, key: string) {
    const redisKey = `${key}`;
    const redisValue = await this.redis.get(redisKey);
    if (!_.isEmpty(redisValue)) {
      const parsedValue = JSON.parse(redisValue);
      const response = _.find(parsedValue, { href: link });
      if (response) {
        return response;
      }
    }
  }
}
