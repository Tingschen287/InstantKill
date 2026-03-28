/**
 * 浏览器自动化基础模块
 * 使用 Playwright 实现浏览器启动、页面导航、元素操作
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';

export class BrowserEngine {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  /**
   * 启动浏览器
   */
  async launch(options?: {
    headless?: boolean;
    slowMo?: number;
  }): Promise<Browser> {
    this.browser = await chromium.launch({
      headless: options?.headless ?? false,
      slowMo: options?.slowMo ?? 0,
    });
    return this.browser;
  }

  /**
   * 创建浏览器上下文
   */
  async createContext(options?: {
    viewport?: { width: number; height: number };
    userAgent?: string;
    locale?: string;
    timezone?: string;
  }): Promise<BrowserContext> {
    if (!this.browser) {
      throw new Error('Browser not launched. Call launch() first.');
    }

    this.context = await this.browser.newContext({
      viewport: options?.viewport ?? { width: 1920, height: 1080 },
      userAgent: options?.userAgent,
      locale: options?.locale ?? 'zh-CN',
      timezoneId: options?.timezone ?? 'Asia/Shanghai',
    });

    return this.context;
  }

  /**
   * 创建新页面
   */
  async newPage(): Promise<Page> {
    if (!this.context) {
      await this.createContext();
    }

    this.page = await this.context!.newPage();
    return this.page;
  }

  /**
   * 获取当前页面
   */
  getPage(): Page | null {
    return this.page;
  }

  /**
   * 导航到指定 URL
   */
  async navigate(url: string, options?: {
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
    timeout?: number;
  }): Promise<void> {
    if (!this.page) {
      throw new Error('No page available. Call newPage() first.');
    }

    await this.page.goto(url, {
      waitUntil: options?.waitUntil ?? 'domcontentloaded',
      timeout: options?.timeout ?? 30000,
    });
  }

  /**
   * 点击元素
   */
  async click(selector: string, options?: {
    timeout?: number;
    force?: boolean;
  }): Promise<void> {
    if (!this.page) {
      throw new Error('No page available.');
    }

    await this.page.click(selector, {
      timeout: options?.timeout ?? 5000,
      force: options?.force ?? false,
    });
  }

  /**
   * 填写输入框
   */
  async fill(selector: string, value: string, options?: {
    timeout?: number;
  }): Promise<void> {
    if (!this.page) {
      throw new Error('No page available.');
    }

    await this.page.fill(selector, value, {
      timeout: options?.timeout ?? 5000,
    });
  }

  /**
   * 等待元素出现
   */
  async waitForSelector(selector: string, options?: {
    timeout?: number;
    state?: 'visible' | 'hidden' | 'attached' | 'detached';
  }): Promise<void> {
    if (!this.page) {
      throw new Error('No page available.');
    }

    await this.page.waitForSelector(selector, {
      timeout: options?.timeout ?? 30000,
      state: options?.state ?? 'visible',
    });
  }

  /**
   * 检查元素是否可用（非 disabled）
   */
  async isElementEnabled(selector: string): Promise<boolean> {
    if (!this.page) {
      throw new Error('No page available.');
    }

    try {
      const element = await this.page.$(selector);
      if (!element) return false;

      const isDisabled = await element.getAttribute('disabled');
      return isDisabled === null;
    } catch {
      return false;
    }
  }

  /**
   * 截图
   */
  async screenshot(path: string): Promise<void> {
    if (!this.page) {
      throw new Error('No page available.');
    }

    await this.page.screenshot({ path, fullPage: false });
  }

  /**
   * 关闭浏览器
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }
}

export default BrowserEngine;
