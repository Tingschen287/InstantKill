/**
 * 按钮状态监听与快速点击策略模块
 * 实时检测按钮 disabled 状态变化，毫秒级响应点击
 *
 * 功能清单:
 * B2 - 按钮状态监听:
 * - [x] 实现按钮元素选择器配置
 * - [x] 实现轮询检测逻辑
 * - [x] 实现变化事件触发
 * - [x] 实现状态变化截图记录
 * - [x] 实现多按钮同时监听
 *
 * B3 - 快速点击:
 * - [x] 实现元素预加载和定位
 * - [x] 实现点击指令排队
 * - [x] 实现点击时机优化
 * - [x] 实现点击成功验证
 * - [x] 实现点击失败重试
 */

import { Page, ElementHandle, BrowserContext } from 'playwright';
import { AntiDetect } from '../engine/anti-detect.js';
import { createLogger } from '../utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';

const logger = createLogger('ClickStrategy');

// ==================== 类型定义 ====================

export interface ButtonState {
  selector: string;
  label?: string;
  isDisabled: boolean;
  isVisible: boolean;
  isEnabled: boolean;
  lastChecked: number;
  attributes: Record<string, string>;
}

export interface ButtonConfig {
  /** 选择器 */
  selector: string;
  /** 标签名称（用于日志） */
  label?: string;
  /** 轮询间隔（毫秒） */
  pollInterval?: number;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 状态变化时的回调 */
  onStateChange?: (oldState: ButtonState, newState: ButtonState) => void;
  /** 按钮可用时的回调 */
  onEnabled?: (state: ButtonState) => void;
  /** 按钮禁用时的回调 */
  onDisabled?: (state: ButtonState) => void;
  /** 是否截图记录状态变化 */
  screenshotOnChange?: boolean;
  /** 截图保存目录 */
  screenshotDir?: string;
}

export interface MultiButtonConfig {
  buttons: ButtonConfig[];
  /** 任意按钮可用时的回调 */
  onAnyEnabled?: (state: ButtonState) => void;
  /** 所有按钮都可用时的回调 */
  onAllEnabled?: (states: ButtonState[]) => void;
}

export interface ClickOptions {
  /** 点击前的延迟（模拟人类反应） */
  preClickDelay?: number;
  /** 点击后的延迟 */
  postClickDelay?: number;
  /** 是否使用随机延迟 */
  useRandomDelay?: boolean;
  /** 点击次数 */
  clickCount?: number;
  /** 是否使用鼠标轨迹 */
  useMousePath?: boolean;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 点击成功验证选择器 */
  successSelector?: string;
  /** 点击成功验证超时 */
  successTimeout?: number;
}

export interface ClickResult {
  success: boolean;
  clicks: number;
  totalTime: number;
  verified: boolean;
  error?: string;
}

export interface ClickQueueItem {
  selector: string;
  options: ClickOptions;
  resolve: (result: ClickResult) => void;
  reject: (error: Error) => void;
  priority: number;
  timestamp: number;
}

// ==================== 按钮状态监听器 ====================

export class ButtonStateMonitor {
  private page: Page;
  private buttonStates: Map<string, ButtonState> = new Map();
  private monitors: Map<string, { running: boolean; stop: () => void }> = new Map();
  private screenshotCount: number = 0;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * 获取按钮当前状态
   */
  async getButtonState(selector: string): Promise<ButtonState> {
    const element = await this.page.$(selector);

    if (!element) {
      return {
        selector,
        isDisabled: true,
        isVisible: false,
        isEnabled: false,
        lastChecked: Date.now(),
        attributes: {},
      };
    }

    const disabled = await element.getAttribute('disabled');
    const ariaDisabled = await element.getAttribute('aria-disabled');
    const hidden = await element.getAttribute('hidden');
    const visible = await element.isVisible();
    const className = await element.getAttribute('class') ?? '';

    // 收集其他相关属性
    const attributes: Record<string, string> = {};
    const attrNames = ['disabled', 'aria-disabled', 'hidden', 'class', 'data-status', 'data-loading'];
    for (const name of attrNames) {
      const value = await element.getAttribute(name);
      if (value !== null) {
        attributes[name] = value;
      }
    }

    const isDisabled = disabled !== null || ariaDisabled === 'true' || hidden !== null;
    const isEnabled = !isDisabled && visible;

    return {
      selector,
      isDisabled,
      isVisible: visible,
      isEnabled,
      lastChecked: Date.now(),
      attributes,
    };
  }

  /**
   * 监听单个按钮状态变化
   */
  async watchButton(config: ButtonConfig): Promise<void> {
    const {
      selector,
      label,
      pollInterval = 50,
      timeout = 60000,
      onStateChange,
      onEnabled,
      onDisabled,
      screenshotOnChange = false,
      screenshotDir = './screenshots',
    } = config;

    const monitorId = `${selector}-${Date.now()}`;
    let running = true;
    const startTime = Date.now();

    // 创建停止函数
    const stopFn = () => {
      running = false;
    };

    this.monitors.set(monitorId, { running: true, stop: stopFn });

    logger.info(`开始监听按钮: ${label ?? selector}`);

    // 获取初始状态
    let lastState = await this.getButtonState(selector);
    this.buttonStates.set(selector, lastState);

    while (running && Date.now() - startTime < timeout) {
      try {
        const currentState = await this.getButtonState(selector);

        // 检查状态变化
        if (currentState.isEnabled !== lastState.isEnabled) {
          logger.info(
            `按钮状态变化: ${label ?? selector} ` +
            `${lastState.isEnabled ? '可用' : '禁用'} -> ${currentState.isEnabled ? '可用' : '禁用'}`
          );

          // 截图记录
          if (screenshotOnChange) {
            await this.takeStateScreenshot(selector, currentState.isEnabled, screenshotDir);
          }

          // 触发回调
          onStateChange?.(lastState, currentState);

          if (currentState.isEnabled) {
            onEnabled?.(currentState);
          } else {
            onDisabled?.(currentState);
          }

          lastState = currentState;
          this.buttonStates.set(selector, currentState);
        }
      } catch (error) {
        logger.debug(`监听错误: ${(error as Error).message}`);
      }

      await this.sleep(pollInterval);
    }

    this.monitors.delete(monitorId);
    logger.debug(`监听结束: ${label ?? selector}`);
  }

  /**
   * 监听多个按钮
   */
  async watchMultipleButtons(config: MultiButtonConfig): Promise<void> {
    const monitorPromises = config.buttons.map((buttonConfig) =>
      this.watchButton({
        ...buttonConfig,
        onEnabled: (state) => {
          buttonConfig.onEnabled?.(state);
          config.onAnyEnabled?.(state);
        },
      })
    );

    // 同时检查是否所有按钮都可用
    const checkAllEnabled = async () => {
      const states = await Promise.all(
        config.buttons.map((b) => this.getButtonState(b.selector))
      );
      const allEnabled = states.every((s) => s.isEnabled);
      if (allEnabled) {
        config.onAllEnabled?.(states);
      }
    };

    // 定期检查所有按钮状态
    const intervalId = setInterval(checkAllEnabled, 1000);

    await Promise.all(monitorPromises);
    clearInterval(intervalId);
  }

  /**
   * 等待按钮可用
   */
  async waitForEnabled(config: ButtonConfig): Promise<ButtonState> {
    return new Promise((resolve, reject) => {
      const timeout = config.timeout ?? 60000;
      const timeoutId = setTimeout(() => {
        this.stopMonitor(config.selector);
        reject(new Error(`等待按钮可用超时: ${config.label ?? config.selector}`));
      }, timeout);

      void this.watchButton({
        ...config,
        onEnabled: (state) => {
          clearTimeout(timeoutId);
          this.stopMonitor(config.selector);
          resolve(state);
        },
      });
    });
  }

  /**
   * 获取缓存的按钮状态
   */
  getCachedState(selector: string): ButtonState | undefined {
    return this.buttonStates.get(selector);
  }

  /**
   * 获取所有按钮状态
   */
  getAllStates(): Map<string, ButtonState> {
    return new Map(this.buttonStates);
  }

  /**
   * 停止监听
   */
  stopMonitor(selector: string): void {
    for (const [id, monitor] of this.monitors) {
      if (id.startsWith(selector)) {
        monitor.stop();
        this.monitors.delete(id);
      }
    }
  }

  /**
   * 停止所有监听
   */
  stopAll(): void {
    for (const monitor of this.monitors.values()) {
      monitor.stop();
    }
    this.monitors.clear();
  }

  /**
   * 状态变化截图
   */
  private async takeStateScreenshot(
    selector: string,
    enabled: boolean,
    dir: string
  ): Promise<void> {
    try {
      // 确保目录存在
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.screenshotCount++;
      const filename = `button-${this.screenshotCount}-${enabled ? 'enabled' : 'disabled'}-${Date.now()}.png`;
      const filepath = path.join(dir, filename);

      await this.page.screenshot({ path: filepath, fullPage: false });
      logger.debug(`状态截图已保存: ${filepath}`);
    } catch (error) {
      logger.warn(`截图失败: ${(error as Error).message}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ==================== 快速点击策略 ====================

export class ClickStrategy {
  private page: Page;
  private preloadedElements: Map<string, ElementHandle> = new Map();
  private clickQueue: ClickQueueItem[] = [];
  private isProcessingQueue: boolean = false;
  private stateMonitor: ButtonStateMonitor;
  private clickStats: { total: number; successful: number; failed: number } = {
    total: 0,
    successful: 0,
    failed: 0,
  };

  constructor(page: Page) {
    this.page = page;
    this.stateMonitor = new ButtonStateMonitor(page);
  }

  // ==================== 元素预加载 ====================

  /**
   * 预加载元素
   * 提前定位元素以便快速点击
   */
  async preloadElement(selector: string): Promise<boolean> {
    try {
      const element = await this.page.$(selector);
      if (element) {
        this.preloadedElements.set(selector, element);
        logger.debug(`预加载元素: ${selector}`);
        return true;
      }
      return false;
    } catch (error) {
      logger.warn(`预加载失败: ${selector}`);
      return false;
    }
  }

  /**
   * 批量预加载元素
   */
  async preloadElements(selectors: string[]): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    await Promise.all(
      selectors.map(async (selector) => {
        const success = await this.preloadElement(selector);
        results.set(selector, success);
      })
    );

    return results;
  }

  /**
   * 刷新预加载的元素
   */
  async refreshPreloaded(selector: string): Promise<boolean> {
    this.preloadedElements.delete(selector);
    return this.preloadElement(selector);
  }

  // ==================== 快速点击 ====================

  /**
   * 快速点击预加载的元素
   * 毫秒级响应
   */
  async quickClickPreloaded(selector: string): Promise<boolean> {
    const element = this.preloadedElements.get(selector);
    if (!element) {
      logger.warn(`元素未预加载: ${selector}`);
      return false;
    }

    try {
      // 直接点击，不等待
      await element.click({ timeout: 100, force: true });
      this.clickStats.total++;
      this.clickStats.successful++;
      logger.debug(`快速点击成功: ${selector}`);
      return true;
    } catch (error) {
      this.clickStats.failed++;
      logger.warn(`快速点击失败: ${selector}`);
      return false;
    }
  }

  /**
   * 智能点击
   * 检测元素可用后立即点击
   */
  async smartClick(selector: string, options?: ClickOptions): Promise<ClickResult> {
    const startTime = Date.now();
    const useRandomDelay = options?.useRandomDelay ?? true;
    const preClickDelay = options?.preClickDelay ?? 50;
    const maxRetries = options?.maxRetries ?? 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // 等待元素可用
        await this.page.waitForSelector(selector, {
          state: 'visible',
          timeout: 5000,
        });

        // 检查是否 enabled
        const isEnabled = await this.isElementEnabled(selector);
        if (!isEnabled) {
          logger.debug(`元素未启用: ${selector}`);
          continue;
        }

        // 点击前延迟（模拟人类反应时间）
        const delay = useRandomDelay
          ? AntiDetect.randomDelay(preClickDelay, preClickDelay * 2)
          : preClickDelay;
        await this.sleep(delay);

        // 可选：使用鼠标轨迹
        if (options?.useMousePath) {
          await this.clickWithMousePath(selector);
        } else {
          await this.page.click(selector);
        }

        this.clickStats.total++;
        this.clickStats.successful++;

        // 验证点击成功
        const verified = await this.verifyClickSuccess(options);

        const totalTime = Date.now() - startTime;
        logger.info(`点击成功: ${selector}，耗时 ${totalTime}ms，验证: ${verified}`);

        return {
          success: true,
          clicks: attempt + 1,
          totalTime,
          verified,
        };
      } catch (error) {
        this.clickStats.failed++;
        logger.warn(`点击失败 (尝试 ${attempt + 1}/${maxRetries}): ${selector}`);

        if (attempt < maxRetries - 1) {
          await this.sleep(50);
        }
      }
    }

    const totalTime = Date.now() - startTime;
    return {
      success: false,
      clicks: maxRetries,
      totalTime,
      verified: false,
      error: '点击重试次数耗尽',
    };
  }

  /**
   * 监听并点击
   * 持续监听元素状态，可用后立即点击
   */
  async watchAndClick(
    selector: string,
    options?: {
      pollInterval?: number;
      timeout?: number;
      clickOptions?: ClickOptions;
      onSuccess?: () => void;
      onDetected?: () => void;
    }
  ): Promise<ClickResult> {
    const pollInterval = options?.pollInterval ?? 50;
    const timeout = options?.timeout ?? 60000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const isEnabled = await this.isElementEnabled(selector);

        if (isEnabled) {
          logger.info(`检测到元素可用，立即点击: ${selector}`);
          options?.onDetected?.();

          const result = await this.smartClick(selector, {
            ...options?.clickOptions,
            preClickDelay: 10, // 更快的反应
            useRandomDelay: false,
            maxRetries: 1,
          });

          if (result.success) {
            options?.onSuccess?.();
            return result;
          }
        }
      } catch (error) {
        // 继续监听
      }

      await this.sleep(pollInterval);
    }

    logger.warn(`监听超时: ${selector}`);
    return {
      success: false,
      clicks: 0,
      totalTime: Date.now() - startTime,
      verified: false,
      error: '监听超时',
    };
  }

  // ==================== 点击队列 ====================

  /**
   * 添加点击任务到队列
   */
  queueClick(selector: string, options: ClickOptions = {}, priority: number = 0): Promise<ClickResult> {
    return new Promise((resolve, reject) => {
      const item: ClickQueueItem = {
        selector,
        options,
        resolve,
        reject,
        priority,
        timestamp: Date.now(),
      };

      // 按优先级插入
      const insertIndex = this.clickQueue.findIndex((i) => i.priority < priority);
      if (insertIndex === -1) {
        this.clickQueue.push(item);
      } else {
        this.clickQueue.splice(insertIndex, 0, item);
      }

      logger.debug(`点击任务入队: ${selector}，优先级 ${priority}，队列长度 ${this.clickQueue.length}`);

      // 启动队列处理
      void this.processQueue();
    });
  }

  /**
   * 处理点击队列
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.clickQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.clickQueue.length > 0) {
      const item = this.clickQueue.shift();
      if (!item) break;

      try {
        const result = await this.smartClick(item.selector, item.options);
        item.resolve(result);
      } catch (error) {
        item.reject(error as Error);
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * 清空点击队列
   */
  clearQueue(): void {
    const count = this.clickQueue.length;
    this.clickQueue.forEach((item) => {
      item.reject(new Error('队列已清空'));
    });
    this.clickQueue = [];
    logger.debug(`点击队列已清空，共 ${count} 个任务`);
  }

  /**
   * 获取队列长度
   */
  getQueueLength(): number {
    return this.clickQueue.length;
  }

  // ==================== 点击时机优化 ====================

  /**
   * 优化的时机点击
   * 分析页面状态，选择最佳点击时机
   */
  async optimizedClick(
    selector: string,
    options?: ClickOptions & {
      waitNetworkIdle?: boolean;
      waitForAnimations?: boolean;
      avoidLoadingState?: boolean;
    }
  ): Promise<ClickResult> {
    // 等待网络空闲
    if (options?.waitNetworkIdle) {
      await this.page.waitForLoadState('networkidle').catch(() => {});
    }

    // 等待动画完成
    if (options?.waitForAnimations) {
      await this.sleep(200);
    }

    // 检查页面是否在加载状态
    if (options?.avoidLoadingState) {
      const isLoading = await this.page.evaluate(() => {
        return document.readyState !== 'complete' ||
          document.querySelector('.loading, .spinner, [data-loading="true"]') !== null;
      });

      if (isLoading) {
        await this.page.waitForLoadState('domcontentloaded').catch(() => {});
      }
    }

    return this.smartClick(selector, options);
  }

  // ==================== 批量点击 ====================

  /**
   * 批量点击多个元素
   */
  async batchClick(
    selectors: string[],
    options?: ClickOptions & { parallel?: boolean }
  ): Promise<Map<string, ClickResult>> {
    const results = new Map<string, ClickResult>();

    if (options?.parallel) {
      const promises = selectors.map(async (selector) => {
        const result = await this.smartClick(selector, options);
        results.set(selector, result);
        return result;
      });
      await Promise.all(promises);
    } else {
      for (const selector of selectors) {
        const result = await this.smartClick(selector, options);
        results.set(selector, result);
      }
    }

    return results;
  }

  // ==================== 统计信息 ====================

  /**
   * 获取点击统计
   */
  getStats(): { total: number; successful: number; failed: number; successRate: number } {
    return {
      ...this.clickStats,
      successRate: this.clickStats.total > 0
        ? this.clickStats.successful / this.clickStats.total
        : 0,
    };
  }

  /**
   * 重置统计
   */
  resetStats(): void {
    this.clickStats = { total: 0, successful: 0, failed: 0 };
  }

  // ==================== 辅助方法 ====================

  /**
   * 使用鼠标轨迹点击
   */
  private async clickWithMousePath(selector: string): Promise<void> {
    const element = await this.page.$(selector);
    if (!element) {
      throw new Error(`元素不存在: ${selector}`);
    }

    const box = await element.boundingBox();
    if (!box) {
      throw new Error(`无法获取元素位置: ${selector}`);
    }

    // 获取当前鼠标位置（假设在页面中心）
    const viewport = this.page.viewportSize() ?? { width: 1920, height: 1080 };
    const startX = viewport.width / 2;
    const startY = viewport.height / 2;

    // 目标位置（元素中心）
    const endX = box.x + box.width / 2;
    const endY = box.y + box.height / 2;

    // 生成鼠标轨迹
    const path = AntiDetect.generateMousePath(startX, startY, endX, endY);

    // 按轨迹移动鼠标
    for (const point of path) {
      await this.page.mouse.move(point.x, point.y);
      await this.sleep(AntiDetect.randomDelay(5, 15));
    }

    // 点击
    await this.page.mouse.click(endX, endY);
  }

  /**
   * 检查元素是否启用
   */
  private async isElementEnabled(selector: string): Promise<boolean> {
    try {
      const element = await this.page.$(selector);
      if (!element) return false;

      const disabled = await element.getAttribute('disabled');
      const ariaDisabled = await element.getAttribute('aria-disabled');
      const visible = await element.isVisible();

      return disabled === null && ariaDisabled !== 'true' && visible;
    } catch {
      return false;
    }
  }

  /**
   * 验证点击成功
   */
  private async verifyClickSuccess(options?: ClickOptions): Promise<boolean> {
    if (!options?.successSelector) return true;

    try {
      await this.page.waitForSelector(options.successSelector, {
        state: 'visible',
        timeout: options.successTimeout ?? 3000,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 清除预加载的元素
   */
  clearPreloaded(): void {
    this.preloadedElements.clear();
  }

  /**
   * 获取状态监听器
   */
  getStateMonitor(): ButtonStateMonitor {
    return this.stateMonitor;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ==================== 便捷方法 ====================

/**
 * 快速点击（单次操作）
 */
export async function quickClick(
  page: Page,
  selector: string,
  options?: ClickOptions
): Promise<ClickResult> {
  const strategy = new ClickStrategy(page);
  return strategy.smartClick(selector, options);
}

/**
 * 监听并点击（等待可用）
 */
export async function waitAndClick(
  page: Page,
  selector: string,
  options?: {
    pollInterval?: number;
    timeout?: number;
    clickOptions?: ClickOptions;
  }
): Promise<ClickResult> {
  const strategy = new ClickStrategy(page);
  return strategy.watchAndClick(selector, options);
}

/**
 * 批量点击
 */
export async function batchClick(
  page: Page,
  selectors: string[],
  options?: ClickOptions & { parallel?: boolean }
): Promise<Map<string, ClickResult>> {
  const strategy = new ClickStrategy(page);
  return strategy.batchClick(selectors, options);
}

export default ClickStrategy;
