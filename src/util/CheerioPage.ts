import { CheerioAPI, load, Element } from 'cheerio';
export class CheerioPage {
  $: CheerioAPI;
  constructor(html: string, private readonly guardType?: string) {
    this.$ = load(html);
    this.guardType = guardType || '';
  }

  isGuarded = this.guardType !== '';

  linkHandler(index: number, element: Element): Record<string, string> {
    const href = this.$(element).attr('href');
    const text = this.$(element).text();
    if (href && text) {
      if (
        (this.isGuarded &&
          href.startsWith(this.guardType) &&
          href !== this.guardType) ||
        href.includes(this.guardType) ||
        !this.isGuarded
      ) {
        if (href && text) {
          return { href, text: text.trim().toLowerCase().replace(/ /g, '-') };
        }
      }
    }
    return {};
  }
  pdfLinkHandler(index: number, element: Element): string {
    const href = this.$(element).attr('src');
    if (href && href.includes(this.guardType)) {
      return href;
    }
    return '';
  }
  crawlPageLinks = (): Record<string, string>[] => {
    const response = this.$('a')
      .map(this.linkHandler.bind(this))
      .get() as Record<string, string>[];
    return response.filter((el) => el['href'] && el['text']);
  };

  crawlPagePdLinks = (): string[] => {
    const response = this.$('iframe')
      .map(this.pdfLinkHandler.bind(this))
      .get() as string[];
    return response.filter((el) => el);
  };

  static createNewInstance(html: string, guardType: string): CheerioPage {
    return new CheerioPage(html, guardType);
  }
}
