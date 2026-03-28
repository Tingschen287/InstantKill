/**
 * 快速点击策略模块
 * 检测到可用后毫秒级响应点击
 */

import { Page, ElementHandle } from 'playwright';
import { AntiDetect } from '../engine/anti-detect.js';

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
}

export class ClickStrategy {
  private page: Page;
  private preloadedElements: Map<string, ElementHandle> = new Map();

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * 预加载元素
   * 提前定位元素以便快速点击
   */
  async preloadElement(selector: string): Promise<void> {
    try {
      const element = await this.page.$(selector);
      if (element) {
        this.preloadedElements.set(selector, element);
        console.log(`[ClickStrategy] 预加载元素: ${selector}`);
      }
    } catch (error) {
      console.warn(`[ClickStrategy] 预加载失败: ${selector}`);
    }
  }

  /**
   * 快速点击预加载的元素
   */
  async quickClickPreloaded(selector: string): Promise<boolean> {
    const element = this.preloadedElements.get(selector);
    if (!element) {
      console.warn(`[ClickStrategy] 元素未预加载: ${selector}`);
      return false;
    }

    try {
      // 直接点击，不等待
      await element.click({ timeout: 100, force: true });
      console.log(`[ClickStrategy] 快速点击成功: ${selector}`);
      return true;
    } catch (error) {
      console.warn(`[ClickStrategy] 快速点击失败: ${selector}`);
      return false;
    }
  }

  /**
   * 智能点击
   * 检测元素可用后立即点击
   */
  async smartClick(
    selector: string,
    options?: ClickOptions
  ): Promise<boolean> {
    const useRandomDelay = options?.useRandomDelay ?? true;
    const preClickDelay = options?.preClickDelay ?? 50;

    try {
      // 等待元素可用
      await this.page.waitForSelector(selector, {
        state: 'visible',
        timeout: 30000,
      });

      // 检查是否 enabled
      const isEnabled = await this.isElementEnabled(selector);
      if (!isEnabled) {
        console.log(`[ClickStrategy] 元素未启用: ${selector}`);
        return false;
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

      // 点击后延迟
      const postDelay = options?.postClickDelay ?? 100;
      await this.sleep(useRandomDelay ? AntiDetect.randomDelay(postDelay, postDelay * 2) : postDelay);

      console.log(`[ClickStrategy] 点击成功: ${selector}`);
      return true;
    } catch (error) {
      console.warn(`[ClickStrategy] 点击失败: ${selector}`, error);
      return false;
    }
  }

  /**
   * 使用鼠标轨迹点击
   * 模拟人类鼠标移动轨迹
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
   * 监听并点击
   * 持续监听元素状态，可用后立即点击
   */
  async watchAndClick(
    selector: string,
    options?: {
      pollInterval?: number;
      timeout?: number;
      onSuccess?: () => void;
    }
  ): Promise<boolean> {
    const pollInterval = options?.pollInterval ?? 50;
    const timeout = options?.timeout ?? 60000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const isEnabled = await this.isElementEnabled(selector);

        if (isEnabled) {
          console.log(`[ClickStrategy] 检测到元素可用，立即点击`);
          const result = await this.smartClick(selector, {
            preClickDelay: 10, // 更快的反应
            useRandomDelay: false,
          });

          if (result) {
            options?.onSuccess?.();
            return true;
          }
        }
      } catch (error) {
        // 继续监听
      }

      await this.sleep(pollInterval);
    }

    console.log(`[ClickStrategy] 监听超时: ${selector}`);
    return false;
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

      return disabled === null && ariaDisabled !== 'true';
    } catch {
      return false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 清除预加载的元素
   */
  clearPreloaded(): void {
    this.preloadedElements.clear();
  }
}

export default ClickStrategy;