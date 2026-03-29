/**
 * 浏览器自动化基础模块
 * 使用 Playwright 实现浏览器启动、页面导航、元素操作
 *
 * 功能清单 (A1):
 * - [x] 安装和配置 Playwright
 * - [x] 实现浏览器上下文管理
 * - [x] 实现页面导航功能
 * - [x] 实现元素定位和操作
 * - [x] 实现浏览器关闭和清理
 * - [x] 多标签页管理
 * - [x] Cookie 管理
 * - [x] 事件监听
 * - [x] 控制台日志捕获
 */

import {
  chromium,
  Browser,
  BrowserContext,
  Page,
  Cookie,
  BrowserContextOptions,
  LaunchOptions,
} from 'playwright';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('BrowserEngine');

export interface BrowserLaunchOptions extends LaunchOptions {
  /** 是否使用无头模式 */
  headless?: boolean;
  /** 操作延迟（毫秒） */
  slowMo?: number;
  /** 是否禁用图片加载（提升性能） */
  disableImages?: boolean;
}

export interface ContextOptions extends BrowserContextOptions {
  /** 视口大小 */
  viewport?: { width: number; height: number };
  /** 用户代理 */
  userAgent?: string;
  /** 语言 */
  locale?: string;
  /** 时区 */
  timezone?: string;
  /** 是否忽略 HTTPS 错误 */
  ignoreHTTPSErrors?: boolean;
}

export interface ElementInfo {
  /** 选择器 */
  selector: string;
  /** 是否存在 */
  exists: boolean;
  /** 是否可见 */
  visible: boolean;
  /** 是否可用 */
  enabled: boolean;
  /** 文本内容 */
  text?: string;
  /** 属性值 */
  attributes?: Record<string, string>;
}

export class BrowserEngine {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private pages: Map<string, Page> = new Map();
  private currentPageId: string | null = null;
  private consoleLogs: string[] = [];

  /**
   * 启动浏览器
   */
  async launch(options?: BrowserLaunchOptions): Promise<Browser> {
    const launchOptions: LaunchOptions = {
      headless: options?.headless ?? false,
      slowMo: options?.slowMo ?? 0,
      args: [],
    };

    // 禁用图片加载以提升性能
    if (options?.disableImages) {
      launchOptions.args?.push('--blink-settings=imagesEnabled=false');
    }

    logger.info('启动浏览器...');
    this.browser = await chromium.launch(launchOptions);

    logger.info('浏览器启动成功');
    return this.browser;
  }

  /**
   * 创建浏览器上下文
   */
  async createContext(options?: ContextOptions): Promise<BrowserContext> {
    if (!this.browser) {
      throw new Error('Browser not launched. Call launch() first.');
    }

    const contextOptions: BrowserContextOptions = {
      viewport: options?.viewport ?? { width: 1920, height: 1080 },
      userAgent: options?.userAgent,
      locale: options?.locale ?? 'zh-CN',
      timezoneId: options?.timezone ?? 'Asia/Shanghai',
      ignoreHTTPSErrors: options?.ignoreHTTPSErrors ?? true,
    };

    this.context = await this.browser.newContext(contextOptions);

    // 设置控制台日志捕获
    this.context.on('console', (msg) => {
      const log = `[${msg.type()}] ${msg.text()}`;
      this.consoleLogs.push(log);
    });

    logger.info('创建浏览器上下文');
    return this.context;
  }

  /**
   * 创建新页面
   * @param pageId 页面标识符（可选）
   */
  async newPage(pageId?: string): Promise<Page> {
    if (!this.context) {
      await this.createContext();
    }

    const id = pageId ?? `page_${Date.now()}`;
    const page = await this.context!.newPage();
    this.pages.set(id, page);
    this.currentPageId = id;

    // 设置页面事件监听
    this.setupPageEvents(page, id);

    logger.info(`创建新页面: ${id}`);
    return page;
  }

  /**
   * 设置页面事件监听
   */
  private setupPageEvents(page: Page, pageId: string): void {
    // 页面错误
    page.on('pageerror', (error) => {
      logger.error(`页面错误 [${pageId}]: ${error.message}`);
    });

    // 请求失败
    page.on('requestfailed', (request) => {
      logger.warn(`请求失败 [${pageId}]: ${request.url()}`);
    });

    // 响应
    page.on('response', (response) => {
      if (response.status() >= 400) {
        logger.warn(`HTTP ${response.status()} [${pageId}]: ${response.url()}`);
      }
    });
  }

  /**
   * 切换到指定页面
   */
  async switchToPage(pageId: string): Promise<Page | null> {
    const page = this.pages.get(pageId);
    if (page) {
      this.currentPageId = pageId;
      await page.bringToFront();
      logger.info(`切换到页面: ${pageId}`);
      return page;
    }
    return null;
  }

  /**
   * 获取当前页面
   */
  getPage(): Page | null {
    if (!this.currentPageId) return null;
    return this.pages.get(this.currentPageId) ?? null;
  }

  /**
   * 获取所有页面
   */
  getAllPages(): Map<string, Page> {
    return this.pages;
  }

  /**
   * 关闭指定页面
   */
  async closePage(pageId: string): Promise<void> {
    const page = this.pages.get(pageId);
    if (page) {
      await page.close();
      this.pages.delete(pageId);
      logger.info(`关闭页面: ${pageId}`);
    }
  }

  /**
   * 导航到指定 URL
   */
  async navigate(
    url: string,
    options?: {
      waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
      timeout?: number;
      referer?: string;
    }
  ): Promise<string> {
    const page = this.getPage();
    if (!page) {
      throw new Error('No page available. Call newPage() first.');
    }

    logger.info(`导航到: ${url}`);
    const response = await page.goto(url, {
      waitUntil: options?.waitUntil ?? 'domcontentloaded',
      timeout: options?.timeout ?? 30000,
      referer: options?.referer,
    });

    return response?.url() ?? url;
  }

  /**
   * 刷新当前页面
   */
  async refresh(options?: {
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
    timeout?: number;
  }): Promise<void> {
    const page = this.getPage();
    if (!page) {
      throw new Error('No page available.');
    }

    await page.reload({
      waitUntil: options?.waitUntil ?? 'domcontentloaded',
      timeout: options?.timeout ?? 30000,
    });
    logger.info('页面已刷新');
  }

  /**
   * 后退
   */
  async goBack(options?: {
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
    timeout?: number;
  }): Promise<boolean> {
    const page = this.getPage();
    if (!page) {
      throw new Error('No page available.');
    }

    return page.goBack({
      waitUntil: options?.waitUntil ?? 'domcontentloaded',
      timeout: options?.timeout ?? 30000,
    }) as Promise<boolean>;
  }

  /**
   * 前进
   */
  async goForward(options?: {
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
    timeout?: number;
  }): Promise<boolean> {
    const page = this.getPage();
    if (!page) {
      throw new Error('No page available.');
    }

    return page.goForward({
      waitUntil: options?.waitUntil ?? 'domcontentloaded',
      timeout: options?.timeout ?? 30000,
    }) as Promise<boolean>;
  }

  // ==================== 元素操作 ====================

  /**
   * 点击元素
   */
  async click(
    selector: string,
    options?: {
      timeout?: number;
      force?: boolean;
      clickCount?: number;
      delay?: number;
    }
  ): Promise<void> {
    const page = this.getPage();
    if (!page) {
      throw new Error('No page available.');
    }

    await page.click(selector, {
      timeout: options?.timeout ?? 5000,
      force: options?.force ?? false,
      clickCount: options?.clickCount ?? 1,
      delay: options?.delay ?? 0,
    });
    logger.debug(`点击元素: ${selector}`);
  }

  /**
   * 双击元素
   */
  async doubleClick(selector: string, options?: { timeout?: number }): Promise<void> {
    await this.click(selector, { ...options, clickCount: 2 });
  }

  /**
   * 填写输入框
   */
  async fill(
    selector: string,
    value: string,
    options?: {
      timeout?: number;
      noWaitAfter?: boolean;
    }
  ): Promise<void> {
    const page = this.getPage();
    if (!page) {
      throw new Error('No page available.');
    }

    await page.fill(selector, value, {
      timeout: options?.timeout ?? 5000,
      noWaitAfter: options?.noWaitAfter,
    });
    logger.debug(`填充输入框: ${selector}`);
  }

  /**
   * 模拟打字输入
   */
  async type(
    selector: string,
    text: string,
    options?: {
      delay?: number;
      timeout?: number;
    }
  ): Promise<void> {
    const page = this.getPage();
    if (!page) {
      throw new Error('No page available.');
    }

    await page.type(selector, text, {
      delay: options?.delay ?? 50,
      timeout: options?.timeout ?? 5000,
    });
    logger.debug(`输入文本: ${selector}`);
  }

  /**
   * 按键
   */
  async press(selector: string, key: string): Promise<void> {
    const page = this.getPage();
    if (!page) {
      throw new Error('No page available.');
    }

    await page.press(selector, key);
    logger.debug(`按键: ${key}`);
  }

  /**
   * 选择下拉框选项
   */
  async selectOption(
    selector: string,
    value: string | string[],
    options?: { timeout?: number }
  ): Promise<string[]> {
    const page = this.getPage();
    if (!page) {
      throw new Error('No page available.');
    }

    const selected = await page.selectOption(selector, value, {
      timeout: options?.timeout ?? 5000,
    });
    logger.debug(`选择选项: ${selector}`);
    return selected;
  }

  /**
   * 勾选复选框
   */
  async check(selector: string, options?: { timeout?: number }): Promise<void> {
    const page = this.getPage();
    if (!page) {
      throw new Error('No page available.');
    }

    await page.check(selector, { timeout: options?.timeout ?? 5000 });
    logger.debug(`勾选: ${selector}`);
  }

  /**
   * 取消勾选
   */
  async uncheck(selector: string, options?: { timeout?: number }): Promise<void> {
    const page = this.getPage();
    if (!page) {
      throw new Error('No page available.');
    }

    await page.uncheck(selector, { timeout: options?.timeout ?? 5000 });
    logger.debug(`取消勾选: ${selector}`);
  }

  // ==================== 元素查询 ====================

  /**
   * 等待元素出现
   */
  async waitForSelector(
    selector: string,
    options?: {
      timeout?: number;
      state?: 'visible' | 'hidden' | 'attached' | 'detached';
    }
  ): Promise<void> {
    const page = this.getPage();
    if (!page) {
      throw new Error('No page available.');
    }

    await page.waitForSelector(selector, {
      timeout: options?.timeout ?? 30000,
      state: options?.state ?? 'visible',
    });
    logger.debug(`等待元素: ${selector}`);
  }

  /**
   * 等待元素消失
   */
  async waitForSelectorHidden(
    selector: string,
    options?: { timeout?: number }
  ): Promise<void> {
    await this.waitForSelector(selector, {
      timeout: options?.timeout ?? 30000,
      state: 'hidden',
    });
  }

  /**
   * 获取元素信息
   */
  async getElementInfo(selector: string): Promise<ElementInfo> {
    const page = this.getPage();
    if (!page) {
      throw new Error('No page available.');
    }

    try {
      const element = await page.$(selector);
      if (!element) {
        return {
          selector,
          exists: false,
          visible: false,
          enabled: false,
        };
      }

      const visible = await element.isVisible();
      const disabled = await element.getAttribute('disabled');
      const text = await element.textContent();
      const className = await element.getAttribute('class');
      const id = await element.getAttribute('id');

      return {
        selector,
        exists: true,
        visible,
        enabled: disabled === null,
        text: text ?? undefined,
        attributes: {
          ...(className && { class: className }),
          ...(id && { id }),
        },
      };
    } catch (error) {
      return {
        selector,
        exists: false,
        visible: false,
        enabled: false,
      };
    }
  }

  /**
   * 检查元素是否可用（非 disabled）
   */
  async isElementEnabled(selector: string): Promise<boolean> {
    const info = await this.getElementInfo(selector);
    return info.exists && info.visible && info.enabled;
  }

  /**
   * 检查元素是否存在
   */
  async elementExists(selector: string): Promise<boolean> {
    const page = this.getPage();
    if (!page) return false;

    const element = await page.$(selector);
    return element !== null;
  }

  /**
   * 获取元素文本
   */
  async getElementText(selector: string): Promise<string | null> {
    const page = this.getPage();
    if (!page) return null;

    const element = await page.$(selector);
    if (!element) return null;

    return element.textContent();
  }

  /**
   * 获取元素属性
   */
  async getElementAttribute(
    selector: string,
    attribute: string
  ): Promise<string | null> {
    const page = this.getPage();
    if (!page) return null;

    const element = await page.$(selector);
    if (!element) return null;

    return element.getAttribute(attribute);
  }

  /**
   * 获取输入框的值
   */
  async getInputValue(selector: string): Promise<string> {
    const page = this.getPage();
    if (!page) return '';

    return page.inputValue(selector);
  }

  // ==================== Cookie 管理 ====================

  /**
   * 获取所有 Cookie
   */
  async getCookies(): Promise<Cookie[]> {
    if (!this.context) {
      throw new Error('No context available.');
    }
    return this.context.cookies();
  }

  /**
   * 获取指定 URL 的 Cookie
   */
  async getCookiesForUrl(url: string): Promise<Cookie[]> {
    if (!this.context) {
      throw new Error('No context available.');
    }
    return this.context.cookies([url]);
  }

  /**
   * 设置 Cookie
   */
  async setCookies(cookies: Cookie[]): Promise<void> {
    if (!this.context) {
      throw new Error('No context available.');
    }
    await this.context.addCookies(cookies);
    logger.info(`设置 ${cookies.length} 个 Cookie`);
  }

  /**
   * 清除所有 Cookie
   */
  async clearCookies(): Promise<void> {
    if (!this.context) {
      throw new Error('No context available.');
    }
    await this.context.clearCookies();
    logger.info('清除所有 Cookie');
  }

  // ==================== 截图和 PDF ====================

  /**
   * 截图
   */
  async screenshot(
    path: string,
    options?: {
      fullPage?: boolean;
      selector?: string;
    }
  ): Promise<void> {
    const page = this.getPage();
    if (!page) {
      throw new Error('No page available.');
    }

    if (options?.selector) {
      const element = await page.$(options.selector);
      if (element) {
        await element.screenshot({ path });
        return;
      }
    }

    await page.screenshot({
      path,
      fullPage: options?.fullPage ?? false,
    });
    logger.info(`截图保存: ${path}`);
  }

  /**
   * 生成 PDF
   */
  async pdf(
    path: string,
    options?: {
      format?: string;
      printBackground?: boolean;
    }
  ): Promise<void> {
    const page = this.getPage();
    if (!page) {
      throw new Error('No page available.');
    }

    await page.pdf({
      path,
      format: options?.format ?? 'A4',
      printBackground: options?.printBackground ?? true,
    });
    logger.info(`PDF 保存: ${path}`);
  }

  // ==================== 执行脚本 ====================

  /**
   * 执行 JavaScript
   */
  async evaluate<T>(script: string | (() => T)): Promise<T> {
    const page = this.getPage();
    if (!page) {
      throw new Error('No page available.');
    }

    return page.evaluate(script);
  }

  /**
   * 在元素上执行 JavaScript
   */
  async evaluateOnElement<T>(
    selector: string,
    script: (element: Element) => T
  ): Promise<T | null> {
    const page = this.getPage();
    if (!page) return null;

    const element = await page.$(selector);
    if (!element) return null;

    return element.evaluate(script);
  }

  // ==================== 网络相关 ====================

  /**
   * 等待请求完成
   */
  async waitForResponse(
    urlPattern: string | RegExp,
    options?: { timeout?: number }
  ): Promise<unknown> {
    const page = this.getPage();
    if (!page) {
      throw new Error('No page available.');
    }

    const response = await page.waitForResponse(urlPattern, {
      timeout: options?.timeout ?? 30000,
    });

    try {
      return await response.json();
    } catch {
      return await response.text();
    }
  }

  /**
   * 拦截请求
   */
  async interceptRequest(
    urlPattern: string | RegExp,
    handler: (route: unknown) => Promise<void>
  ): Promise<void> {
    const page = this.getPage();
    if (!page) return;

    await page.route(urlPattern, handler as never);
    logger.info(`设置请求拦截: ${urlPattern}`);
  }

  // ==================== 工具方法 ====================

  /**
   * 获取当前 URL
   */
  getCurrentUrl(): string {
    const page = this.getPage();
    return page?.url() ?? '';
  }

  /**
   * 获取页面标题
   */
  async getTitle(): Promise<string> {
    const page = this.getPage();
    if (!page) return '';
    return page.title();
  }

  /**
   * 获取控制台日志
   */
  getConsoleLogs(): string[] {
    return [...this.consoleLogs];
  }

  /**
   * 清空控制台日志
   */
  clearConsoleLogs(): void {
    this.consoleLogs = [];
  }

  /**
   * 等待指定时间
   */
  async wait(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 等待页面加载完成
   */
  async waitForLoadState(
    state?: 'load' | 'domcontentloaded' | 'networkidle',
    timeout?: number
  ): Promise<void> {
    const page = this.getPage();
    if (!page) return;

    await page.waitForLoadState(state ?? 'domcontentloaded', { timeout });
  }

  // ==================== 清理 ====================

  /**
   * 关闭浏览器
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.pages.clear();
      this.currentPageId = null;
      this.consoleLogs = [];
      logger.info('浏览器已关闭');
    }
  }

  /**
   * 检查浏览器是否已启动
   */
  isLaunched(): boolean {
    return this.browser !== null;
  }

  /**
   * 检查是否有可用页面
   */
  hasPage(): boolean {
    return this.currentPageId !== null && this.pages.size > 0;
  }
}

export default BrowserEngine;
