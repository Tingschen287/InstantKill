/**
 * 页面监控模块
 * 实时监控页面变化、按钮状态、接口响应
 *
 * 功能清单 (A3):
 * - [x] 实现 DOM 变化监听（MutationObserver）
 * - [x] 实现按钮 disabled 状态轮询
 * - [x] 实现网络请求拦截和监听
 * - [x] 实现页面错误检测
 * - [x] 实现超时和重载机制
 * - [x] 控制台日志监控
 * - [x] 性能指标监控
 * - [x] 弹窗/对话框监控
 */

import { Page, Request, Response, Dialog, ConsoleMessage } from 'playwright';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('PageMonitor');

// ==================== 类型定义 ====================

export interface MonitorOptions {
  /** 轮询间隔（毫秒） */
  pollInterval?: number;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 变化时的回调 */
  onChange?: (state: ElementState) => void;
  /** 错误回调 */
  onError?: (error: Error) => void;
}

export interface ElementState {
  selector: string;
  exists: boolean;
  visible: boolean;
  enabled: boolean;
  text?: string;
  value?: string;
  className?: string;
  attributes?: Record<string, string>;
  timestamp: number;
}

export interface NetworkEvent {
  type: 'request' | 'response' | 'failure';
  url: string;
  method: string;
  status?: number;
  timing?: number;
  body?: unknown;
  error?: string;
  timestamp: number;
}

export interface PageError {
  type: 'pageerror' | 'console' | 'exception';
  message: string;
  stack?: string;
  url?: string;
  line?: number;
  timestamp: number;
}

export interface DOMMutationEvent {
  type: 'attributes' | 'childList' | 'characterData';
  target: string;
  attributeName?: string;
  oldValue?: string;
  newValue?: string;
  addedNodes?: string[];
  removedNodes?: string[];
  timestamp: number;
}

export interface PerformanceMetrics {
  loadTime?: number;
  domContentLoaded?: number;
  firstPaint?: number;
  firstContentfulPaint?: number;
  timeToInteractive?: number;
  memoryUsage?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
  };
  timestamp: number;
}

export interface DialogEvent {
  type: 'alert' | 'confirm' | 'prompt' | 'beforeunload';
  message: string;
  timestamp: number;
}

export interface MonitorStats {
  networkEvents: number;
  errors: number;
  domMutations: number;
  dialogs: number;
  startTime: number;
}

// ==================== 页面监控类 ====================

export class PageMonitor {
  private page: Page;
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private networkEvents: NetworkEvent[] = [];
  private pageErrors: PageError[] = [];
  private domMutations: DOMMutationEvent[] = [];
  private dialogEvents: DialogEvent[] = [];
  private performanceMetrics: PerformanceMetrics | null = null;
  private startTime: number = 0;
  private isMonitoring: boolean = false;
  private eventListeners: Map<string, () => void> = new Map();

  constructor(page: Page) {
    this.page = page;
  }

  // ==================== 元素监控 ====================

  /**
   * 监控元素状态变化
   */
  async watchElement(
    selector: string,
    options?: MonitorOptions
  ): Promise<ElementState> {
    const pollInterval = options?.pollInterval ?? 100;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
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
            clearTimeout(timeoutId);
            this.stopWatching(selector);
            resolve(state);
          }
        } catch (error) {
          options?.onError?.(error as Error);
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
   * 监控元素状态（持续监控，不自动结束）
   */
  watchElementContinuous(
    selector: string,
    onChange: (state: ElementState, previousState: ElementState | null) => void,
    options?: { pollInterval?: number }
  ): void {
    const pollInterval = options?.pollInterval ?? 200;
    let previousState: ElementState | null = null;

    const poll = async () => {
      try {
        const state = await this.getElementState(selector);

        // 检查状态是否变化
        if (this.hasStateChanged(previousState, state)) {
          onChange(state, previousState);
          previousState = state;
        }
      } catch (error) {
        logger.warn(`轮询错误 [${selector}]: ${error}`);
      }
    };

    poll();
    const intervalId = setInterval(poll, pollInterval);
    this.pollingIntervals.set(`continuous:${selector}`, intervalId);
  }

  /**
   * 检查元素状态是否变化
   */
  private hasStateChanged(
    prev: ElementState | null,
    curr: ElementState
  ): boolean {
    if (!prev) return true;
    return (
      prev.exists !== curr.exists ||
      prev.visible !== curr.visible ||
      prev.enabled !== curr.enabled ||
      prev.text !== curr.text ||
      prev.value !== curr.value
    );
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
          timestamp: Date.now(),
        };
      }

      const isVisible = await element.isVisible();
      const isDisabled = await element.getAttribute('disabled');
      const isReadOnly = await element.getAttribute('readonly');
      const text = await element.textContent();
      const value = await element.getAttribute('value');
      const className = await element.getAttribute('class');
      const id = await element.getAttribute('id');

      return {
        selector,
        exists: true,
        visible: isVisible,
        enabled: isDisabled === null && isReadOnly === null,
        text: text ?? undefined,
        value: value ?? undefined,
        className: className ?? undefined,
        attributes: id ? { id } : undefined,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        selector,
        exists: false,
        visible: false,
        enabled: false,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * 监控多个元素（任意一个可用即返回）
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
   * 监控所有元素（全部可用才返回）
   */
  async watchAll(
    selectors: string[],
    options?: MonitorOptions
  ): Promise<ElementState[]> {
    return Promise.all(
      selectors.map((selector) => this.watchElement(selector, options))
    );
  }

  // ==================== DOM 变化监控 ====================

  /**
   * 启动 DOM 变化监控
   */
  async startDOMWatcher(options?: {
    targetSelector?: string;
    attributeFilter?: string[];
    onMutation?: (event: DOMMutationEvent) => void;
  }): Promise<void> {
    const targetSelector = options?.targetSelector ?? 'body';

    await this.page.evaluate(
      ({ target, attrFilter }) => {
        const targetElement = document.querySelector(target);
        if (!targetElement) return;

        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            const event = {
              type: mutation.type,
              target: (mutation.target as Element).tagName ?? 'unknown',
              attributeName: mutation.attributeName ?? undefined,
              oldValue: mutation.oldValue ?? undefined,
              newValue:
                mutation.type === 'attributes'
                  ? (mutation.target as Element).getAttribute(mutation.attributeName ?? '') ?? undefined
                  : undefined,
              addedNodes: Array.from(mutation.addedNodes).map((n) => (n as Element).tagName ?? 'text'),
              removedNodes: Array.from(mutation.removedNodes).map((n) => (n as Element).tagName ?? 'text'),
              timestamp: Date.now(),
            };

            // 发送到主进程
            (window as unknown as Record<string, unknown>).__domMutation__ = event;
          });
        });

        observer.observe(targetElement, {
          attributes: true,
          childList: true,
          subtree: true,
          characterData: true,
          attributeOldValue: true,
          attributeFilter: attrFilter,
        });

        (window as unknown as Record<string, unknown>).__domObserver__ = observer;
      },
      { target: targetSelector, attrFilter: options?.attributeFilter }
    );

    // 监听 DOM 变化
    const exposureFunction = async () => {
      const event = await this.page.evaluate(() => {
        const e = (window as unknown as Record<string, unknown>).__domMutation__;
        (window as unknown as Record<string, unknown>).__domMutation__ = null;
        return e as DOMMutationEvent | null;
      });

      if (event) {
        this.domMutations.push(event);
        options?.onMutation?.(event);
        logger.debug(`DOM 变化: ${event.type} on ${event.target}`);
      }
    };

    // 设置轮询检查 DOM 变化
    const intervalId = setInterval(exposureFunction, 100);
    this.pollingIntervals.set('dom-watcher', intervalId);

    logger.info('DOM 变化监控已启动');
  }

  /**
   * 停止 DOM 变化监控
   */
  async stopDOMWatcher(): Promise<void> {
    await this.page.evaluate(() => {
      const observer = (window as unknown as Record<string, unknown>).__domObserver__ as MutationObserver;
      if (observer) {
        observer.disconnect();
      }
    });

    this.stopWatching('dom-watcher');
    logger.info('DOM 变化监控已停止');
  }

  // ==================== 网络请求监控 ====================

  /**
   * 启动网络请求监控
   */
  startNetworkWatcher(options?: {
    urlPattern?: RegExp | string;
    onRequest?: (event: NetworkEvent) => void;
    onResponse?: (event: NetworkEvent) => void;
    onFailure?: (event: NetworkEvent) => void;
    captureBody?: boolean;
  }): void {
    const urlPattern = options?.urlPattern;

    // 监听请求
    const requestHandler = (request: Request) => {
      const url = request.url();
      if (urlPattern && !this.matchPattern(url, urlPattern)) return;

      const event: NetworkEvent = {
        type: 'request',
        url,
        method: request.method(),
        timestamp: Date.now(),
      };

      this.networkEvents.push(event);
      options?.onRequest?.(event);
    };

    // 监听响应
    const responseHandler = async (response: Response) => {
      const url = response.url();
      if (urlPattern && !this.matchPattern(url, urlPattern)) return;

      const request = response.request();
      let body: unknown = undefined;

      if (options?.captureBody) {
        try {
          const contentType = response.headers()['content-type'] ?? '';
          if (contentType.includes('application/json')) {
            body = await response.json();
          } else if (contentType.includes('text/')) {
            body = await response.text();
          }
        } catch {
          // 忽略解析错误
        }
      }

      const event: NetworkEvent = {
        type: 'response',
        url,
        method: request.method(),
        status: response.status(),
        timing: response.timing().responseEnd,
        body,
        timestamp: Date.now(),
      };

      this.networkEvents.push(event);
      options?.onResponse?.(event);
    };

    // 监听失败
    const failureHandler = (request: Request) => {
      const url = request.url();
      if (urlPattern && !this.matchPattern(url, urlPattern)) return;

      const event: NetworkEvent = {
        type: 'failure',
        url,
        method: request.method(),
        error: request.failure()?.errorText,
        timestamp: Date.now(),
      };

      this.networkEvents.push(event);
      options?.onFailure?.(event);
    };

    this.page.on('request', requestHandler);
    this.page.on('response', responseHandler);
    this.page.on('requestfailed', failureHandler);

    // 保存清理函数
    this.eventListeners.set('network', () => {
      this.page.off('request', requestHandler);
      this.page.off('response', responseHandler);
      this.page.off('requestfailed', failureHandler);
    });

    this.isMonitoring = true;
    logger.info('网络请求监控已启动');
  }

  /**
   * 停止网络请求监控
   */
  stopNetworkWatcher(): void {
    const cleanup = this.eventListeners.get('network');
    if (cleanup) {
      cleanup();
      this.eventListeners.delete('network');
    }
    logger.info('网络请求监控已停止');
  }

  /**
   * 等待特定网络请求
   */
  async waitForRequest(
    urlPattern: RegExp | string,
    options?: { timeout?: number }
  ): Promise<NetworkEvent> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.stopNetworkWatcher();
        reject(new Error(`等待请求超时: ${urlPattern}`));
      }, options?.timeout ?? 30000);

      this.startNetworkWatcher({
        urlPattern,
        onResponse: (event) => {
          clearTimeout(timeout);
          this.stopNetworkWatcher();
          resolve(event);
        },
      });
    });
  }

  /**
   * 等待特定响应内容
   */
  async waitForResponseContent(
    urlPattern: RegExp | string,
    contentPredicate: (body: unknown) => boolean,
    options?: { timeout?: number }
  ): Promise<NetworkEvent> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.stopNetworkWatcher();
        reject(new Error('等待响应内容超时'));
      }, options?.timeout ?? 30000);

      this.startNetworkWatcher({
        urlPattern,
        captureBody: true,
        onResponse: (event) => {
          if (contentPredicate(event.body)) {
            clearTimeout(timeout);
            this.stopNetworkWatcher();
            resolve(event);
          }
        },
      });
    });
  }

  // ==================== 错误监控 ====================

  /**
   * 启动错误监控
   */
  startErrorWatcher(options?: {
    onError?: (error: PageError) => void;
    includeConsole?: boolean;
  }): void {
    // 页面错误
    const pageErrorHandler = (error: Error) => {
      const event: PageError = {
        type: 'pageerror',
        message: error.message,
        stack: error.stack,
        timestamp: Date.now(),
      };
      this.pageErrors.push(event);
      options?.onError?.(event);
      logger.error(`页面错误: ${error.message}`);
    };

    // 控制台消息
    const consoleHandler = (msg: ConsoleMessage) => {
      if (!options?.includeConsole) return;

      const type = msg.type();
      if (type === 'error' || type === 'warning') {
        const event: PageError = {
          type: 'console',
          message: msg.text(),
          url: msg.location().url,
          line: msg.location().lineNumber,
          timestamp: Date.now(),
        };
        this.pageErrors.push(event);
        if (type === 'error') {
          options?.onError?.(event);
        }
        logger.warn(`控制台 [${type}]: ${msg.text()}`);
      }
    };

    this.page.on('pageerror', pageErrorHandler);
    this.page.on('console', consoleHandler);

    this.eventListeners.set('error', () => {
      this.page.off('pageerror', pageErrorHandler);
      this.page.off('console', consoleHandler);
    });

    logger.info('错误监控已启动');
  }

  /**
   * 停止错误监控
   */
  stopErrorWatcher(): void {
    const cleanup = this.eventListeners.get('error');
    if (cleanup) {
      cleanup();
      this.eventListeners.delete('error');
    }
    logger.info('错误监控已停止');
  }

  // ==================== 弹窗监控 ====================

  /**
   * 启动弹窗监控
   */
  startDialogWatcher(options?: {
    onDialog?: (event: DialogEvent) => void;
    autoAccept?: boolean;
  }): void {
    const dialogHandler = async (dialog: Dialog) => {
      const event: DialogEvent = {
        type: dialog.type() as DialogEvent['type'],
        message: dialog.message(),
        timestamp: Date.now(),
      };

      this.dialogEvents.push(event);
      options?.onDialog?.(event);
      logger.info(`检测到弹窗 [${dialog.type()}]: ${dialog.message()}`);

      // 自动处理弹窗
      if (options?.autoAccept) {
        await dialog.accept();
        logger.debug('弹窗已自动接受');
      } else {
        await dialog.dismiss();
        logger.debug('弹窗已自动关闭');
      }
    };

    this.page.on('dialog', dialogHandler);
    this.eventListeners.set('dialog', () => {
      this.page.off('dialog', dialogHandler);
    });

    logger.info('弹窗监控已启动');
  }

  /**
   * 停止弹窗监控
   */
  stopDialogWatcher(): void {
    const cleanup = this.eventListeners.get('dialog');
    if (cleanup) {
      cleanup();
      this.eventListeners.delete('dialog');
    }
    logger.info('弹窗监控已停止');
  }

  // ==================== 性能监控 ====================

  /**
   * 获取性能指标
   */
  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    const metrics = await this.page.evaluate(() => {
      const perf = performance;
      const nav = perf.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;

      return {
        loadTime: nav?.loadEventEnd ?? undefined,
        domContentLoaded: nav?.domContentLoadedEventEnd ?? undefined,
        firstPaint: perf.getEntriesByName('first-paint')[0]?.startTime ?? undefined,
        firstContentfulPaint: perf.getEntriesByName('first-contentful-paint')[0]?.startTime ?? undefined,
        timeToInteractive: undefined, // 需要额外计算
        memoryUsage: (perf as unknown as Record<string, unknown>).memory
          ? {
              usedJSHeapSize: ((perf as unknown as Record<string, unknown>).memory as { usedJSHeapSize: number }).usedJSHeapSize,
              totalJSHeapSize: ((perf as unknown as Record<string, unknown>).memory as { totalJSHeapSize: number }).totalJSHeapSize,
            }
          : undefined,
        timestamp: Date.now(),
      };
    });

    this.performanceMetrics = metrics;
    return metrics;
  }

  // ==================== URL 监控 ====================

  /**
   * 等待 URL 变化
   */
  async waitForUrlChange(options?: { timeout?: number }): Promise<string> {
    const currentUrl = this.page.url();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('URL 变化等待超时'));
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

  /**
   * 监控 URL 变化（持续）
   */
  watchUrlChanges(onChange: (newUrl: string, previousUrl: string) => void): void {
    let previousUrl = this.page.url();

    const checkUrl = setInterval(() => {
      const currentUrl = this.page.url();
      if (currentUrl !== previousUrl) {
        onChange(currentUrl, previousUrl);
        previousUrl = currentUrl;
      }
    }, 100);

    this.pollingIntervals.set('url-watcher', checkUrl);
  }

  // ==================== 超时和重载 ====================

  /**
   * 带超时和自动重载的页面操作
   */
  async withAutoReload<T>(
    operation: () => Promise<T>,
    options?: {
      timeout?: number;
      maxRetries?: number;
      reloadDelay?: number;
      shouldReload?: (error: Error) => boolean;
    }
  ): Promise<T> {
    const timeout = options?.timeout ?? 30000;
    const maxRetries = options?.maxRetries ?? 3;
    const reloadDelay = options?.reloadDelay ?? 1000;
    let retries = 0;

    while (retries <= maxRetries) {
      try {
        const result = await Promise.race([
          operation(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('操作超时')), timeout)
          ),
        ]);
        return result;
      } catch (error) {
        retries++;

        if (retries > maxRetries) {
          throw error;
        }

        const shouldReload = options?.shouldReload?.(error as Error) ?? true;
        if (shouldReload) {
          logger.warn(`操作失败，${reloadDelay}ms 后重载页面 (尝试 ${retries}/${maxRetries})`);
          await this.page.waitForTimeout(reloadDelay);
          await this.page.reload({ waitUntil: 'domcontentloaded' });
        }
      }
    }

    throw new Error('操作失败，已达到最大重试次数');
  }

  /**
   * 监控页面健康状态
   */
  async checkPageHealth(): Promise<{
    isHealthy: boolean;
    issues: string[];
    url: string;
    loadState: string;
  }> {
    const issues: string[] = [];
    const url = this.page.url();

    // 检查是否有严重错误
    const criticalErrors = this.pageErrors.filter(
      (e) => e.type === 'pageerror'
    );
    if (criticalErrors.length > 0) {
      issues.push(`检测到 ${criticalErrors.length} 个页面错误`);
    }

    // 检查是否有失败的请求
    const failedRequests = this.networkEvents.filter(
      (e) => e.type === 'failure'
    );
    if (failedRequests.length > 0) {
      issues.push(`检测到 ${failedRequests.length} 个失败的请求`);
    }

    // 检查页面是否可交互
    let loadState = 'unknown';
    try {
      loadState = await this.page.evaluate(() => document.readyState);
      if (loadState !== 'complete') {
        issues.push(`页面未完全加载: ${loadState}`);
      }
    } catch {
      issues.push('无法获取页面状态');
    }

    return {
      isHealthy: issues.length === 0,
      issues,
      url,
      loadState,
    };
  }

  // ==================== 工具方法 ====================

  /**
   * 匹配 URL 模式
   */
  private matchPattern(url: string, pattern: RegExp | string): boolean {
    if (typeof pattern === 'string') {
      return url.includes(pattern);
    }
    return pattern.test(url);
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
    // 停止所有轮询
    for (const [selector] of this.pollingIntervals) {
      this.stopWatching(selector);
    }

    // 停止所有事件监听
    for (const [, cleanup] of this.eventListeners) {
      cleanup();
    }
    this.eventListeners.clear();

    this.isMonitoring = false;
    logger.info('所有监控已停止');
  }

  /**
   * 获取监控统计
   */
  getStats(): MonitorStats {
    return {
      networkEvents: this.networkEvents.length,
      errors: this.pageErrors.length,
      domMutations: this.domMutations.length,
      dialogs: this.dialogEvents.length,
      startTime: this.startTime,
    };
  }

  /**
   * 获取所有网络事件
   */
  getNetworkEvents(): NetworkEvent[] {
    return [...this.networkEvents];
  }

  /**
   * 获取所有页面错误
   */
  getPageErrors(): PageError[] {
    return [...this.pageErrors];
  }

  /**
   * 获取所有 DOM 变化
   */
  getDOMMutations(): DOMMutationEvent[] {
    return [...this.domMutations];
  }

  /**
   * 获取所有弹窗事件
   */
  getDialogEvents(): DialogEvent[] {
    return [...this.dialogEvents];
  }

  /**
   * 清空事件历史
   */
  clearHistory(): void {
    this.networkEvents = [];
    this.pageErrors = [];
    this.domMutations = [];
    this.dialogEvents = [];
    this.performanceMetrics = null;
    logger.info('事件历史已清空');
  }

  /**
   * 启动所有监控
   */
  startAll(options?: {
    watchNetwork?: boolean;
    watchErrors?: boolean;
    watchDialogs?: boolean;
    networkPattern?: RegExp | string;
    onError?: (error: PageError) => void;
    onNetwork?: (event: NetworkEvent) => void;
    onDialog?: (event: DialogEvent) => void;
  }): void {
    this.startTime = Date.now();

    if (options?.watchNetwork !== false) {
      this.startNetworkWatcher({
        urlPattern: options?.networkPattern,
        onResponse: options?.onNetwork,
      });
    }

    if (options?.watchErrors !== false) {
      this.startErrorWatcher({
        onError: options?.onError,
        includeConsole: true,
      });
    }

    if (options?.watchDialogs !== false) {
      this.startDialogWatcher({
        onDialog: options?.onDialog,
      });
    }

    this.isMonitoring = true;
    logger.info('所有监控已启动');
  }
}

export default PageMonitor;