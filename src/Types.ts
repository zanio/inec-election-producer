
export enum Guard {
  Root = '/elections/types',
  LGA = '/context/ward/lga',
  PU = '/context/pus/lga',
}

export interface IJobWardCrawler {
  link: Record<string, string>;
}
