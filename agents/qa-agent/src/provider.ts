export interface PageMeta {
  name: string;
  content: string;
}

export interface PageLink {
  href: string;
  text: string;
}

export interface PageForm {
  action: string;
  method: string;
  fields: string[];
}

export interface PageImage {
  src: string;
  alt: string;
}

export interface PageResult {
  url: string;
  status: number;
  title: string;
  links: PageLink[];
  forms: PageForm[];
  images: PageImage[];
  meta: PageMeta[];
}

export interface CrawlResult {
  pages: PageResult[];
}

export interface CrawlOptions {
  maxPages?: number;
  depth?: number;
  timeout?: number;
}

export interface CrawlProvider {
  name: string;
  crawl(url: string, options?: CrawlOptions): Promise<CrawlResult>;
}
