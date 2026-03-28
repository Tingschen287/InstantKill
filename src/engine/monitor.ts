/**
 * 页面监控模块
 * 实时监控页面变化、按钮状态、接口响应
 */

import { Page } from 'playwright';

export interface MonitorOptions {
  /** 轮询间隔（毫秒） */
  pollInterval?: number;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 变化时的回调 */
  onChange?: (state: ElementState) => void;
}

export interface ElementState {
  selector: string;
  exists: boolean;
  visible: boolean;
  enabled: boolean;
  text?: string;
}

export class PageMonitor {
  private page: Page;
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * 监控元素状态变化
   */
  async watchElement(
    selector: string,
    options?: MonitorOptions
  ): Promise<ElementState> {
    const pollInterval = options?.pollInterval ?? 100;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.stopWatching(selector);
        reject(new Error(`Watch timeout for selector: ${selector}`));
      }, options?.timeout ?? 30000);

      const poll = async () => {
        try {
          const state = await this.getElementState(selector);

          // 触发变化回调
          options?.onChange?.(state);

          // 如果元素变为可用，停止监控并返回
          if (state.exists && state.visible && state.enabled) {
            clearTimeout(timeout);
            this.stopWatching(selector);
            resolve(state);
          }
        } catch (error) {
          // 继续轮询，不中断
        }
      };

      // 立即执行一次
      poll();

      // 设置定时轮询
      const intervalId = setInterval(poll, pollInterval);
      this.pollingIntervals.set(selector, intervalId);
    });
  }

  /**
   * 获取元素当前状态
   */
  async getElementState(selector: string): Promise<ElementState> {
    try {
      const element = await this.page.$(selector);

      if (!element) {
        return {
          selector,
          exists: false,
          visible: false,
          enabled: false,
        };
      }

      const isVisible = await element.isVisible();
      const isDisabled = await element.getAttribute('disabled');
      const text = await element.textContent();

      return {
        selector,
        exists: true,
        visible: isVisible,
        enabled: isDisabled === null,
        text: text ?? undefined,
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
   * 监控多个元素
   */
  async watchMultiple(
    selectors: string[],
    options?: MonitorOptions
  ): Promise<ElementState> {
    return Promise.race(
      selectors.map((selector) => this.watchElement(selector, options))
    );
  }

  /**
   * 停止监控指定元素
   */
  stopWatching(selector: string): void {
    const intervalId = this.pollingIntervals.get(selector);
    if (intervalId) {
      clearInterval(intervalId);
      this.pollingIntervals.delete(selector);
    }
  }

  /**
   * 停止所有监控
   */
  stopAll(): void {
    for (const [selector] of this.pollingIntervals) {
      this.stopWatching(selector);
    }
  }

  /**
   * 监控网络请求
   */
  watchNetworkRequests(
    onMatch: (url: string, response: unknown) => void,
    urlPattern?: RegExp
  ): void {
    this.page.on('response', async (response) => {
      const url = response.url();

      if (!urlPattern || urlPattern.test(url)) {
        try {
          const data = await response.json();
          onMatch(url, data);
        } catch {
          // 非 JSON 响应，忽略
        }
      }
    });
  }

  /**
   * 等待 URL 变化
   */
  async waitForUrlChange(options?: {
    timeout?: number;
  }): Promise<string> {
    const currentUrl = this.page.url();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('URL change timeout'));
      }, options?.timeout ?? 30000);

      const checkUrl = setInterval(async () => {
        const newUrl = this.page.url();
        if (newUrl !== currentUrl) {
          clearTimeout(timeout);
          clearInterval(checkUrl);
          resolve(newUrl);
        }
      }, 100);
    });
  }
}

export default PageMonitor;
