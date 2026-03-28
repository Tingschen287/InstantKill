/**
 * 定时刷新策略模块
 * 精确到毫秒的定时刷新，支持多页面并行
 */

import { Page } from 'playwright';

export interface RefreshOptions {
  /** 刷新间隔（毫秒） */
  interval?: number;
  /** 目标时间（精确刷新到这个时间点） */
  targetTime?: Date;
  /** 最大刷新次数 */
  maxRefreshes?: number;
  /** 刷新前的条件检查 */
  shouldRefresh?: () => boolean | Promise<boolean>;
  /** 刷新后的回调 */
  onRefresh?: (attempt: number) => void;
}

export class RefreshStrategy {
  private page: Page;
  private refreshCount: number = 0;
  private isRunning: boolean = false;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * 精确定时刷新
   * 在指定时间点精确刷新页面
   */
  async refreshAtTargetTime(
    targetTime: Date,
    options?: {
     提前刷新次数?: number;
      刷新前检查?: () => Promise<boolean>;
    }
  ): Promise<void> {
    const now = Date.now();
    const target = targetTime.getTime();

    if (target <= now) {
      throw new Error('目标时间必须是未来时间');
    }

    // 提前几次刷新预热页面
    const warmupRefreshes = options?.提前刷新次数 ?? 3;
    const warmupInterval = Math.max((target - now) / (warmupRefreshes + 1), 1000);

    for (let i = 0; i < warmupRefreshes; i++) {
      const warmupTime = now + warmupInterval * (i + 1);
      await this.waitUntil(warmupTime);

      if (options?.刷新前检查) {
        const shouldContinue = await options.刷新前检查();
        if (!shouldContinue) {
          console.log('[RefreshStrategy] 提前检查失败，终止刷新');
          return;
        }
      }

      await this.page.reload({ waitUntil: 'domcontentloaded' });
      console.log(`[RefreshStrategy] 预热刷新 ${i + 1}/${warmupRefreshes}`);
    }

    // 精确等待到目标时间
    await this.waitUntil(target - 10); // 留出 10ms 缓冲

    // 最终刷新
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    console.log(`[RefreshStrategy] 精确刷新完成，时间差: ${Date.now() - target}ms`);
  }

  /**
   * 循环刷新
   * 按固定间隔持续刷新页面
   */
  async startLoopRefresh(options: RefreshOptions): Promise<void> {
    this.isRunning = true;
    const interval = options.interval ?? 1000;
    const maxRefreshes = options.maxRefreshes ?? Infinity;

    while (this.isRunning && this.refreshCount < maxRefreshes) {
      // 检查是否应该刷新
      if (options.shouldRefresh) {
        const should = await options.shouldRefresh();
        if (!should) {
          console.log('[RefreshStrategy] 条件检查不满足，暂停刷新');
          await this.sleep(500);
          continue;
        }
      }

      // 执行刷新
      await this.page.reload({ waitUntil: 'domcontentloaded' });
      this.refreshCount++;

      // 触发回调
      options.onRefresh?.(this.refreshCount);

      // 等待间隔
      await this.sleep(interval);
    }
  }

  /**
   * 停止循环刷新
   */
  stopLoopRefresh(): void {
    this.isRunning = false;
    console.log(`[RefreshStrategy] 停止刷新，共刷新 ${this.refreshCount} 次`);
  }

  /**
   * 智能刷新
   * 根据页面状态决定刷新策略
   */
  async smartRefresh(options?: {
    /** 检测到错误时的处理 */
    onError?: (error: Error) => void;
    /** 检测到成功时的处理 */
    onSuccess?: () => void;
    /** 检查成功条件 */
    successCondition?: () => Promise<boolean>;
  }): Promise<boolean> {
    try {
      await this.page.reload({ waitUntil: 'domcontentloaded' });
      this.refreshCount++;

      // 检查是否成功
      if (options?.successCondition) {
        const isSuccess = await options.successCondition();
        if (isSuccess) {
          options?.onSuccess?.();
          return true;
        }
      }

      return false;
    } catch (error) {
      options?.onError?.(error as Error);
      return false;
    }
  }

  /**
   * 等待直到指定时间
   */
  private async waitUntil(targetTime: number): Promise<void> {
    const now = Date.now();
    const delay = targetTime - now;

    if (delay > 0) {
      // 使用 setImmediate 实现高精度等待
      if (delay > 100) {
        await this.sleep(delay - 50);
      }
      // 最后 50ms 使用 busy wait 确保精度
      while (Date.now() < targetTime) {
        // busy wait
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 获取刷新计数
   */
  getRefreshCount(): number {
    return this.refreshCount;
  }

  /**
   * 重置刷新计数
   */
  reset(): void {
    this.refreshCount = 0;
    this.isRunning = false;
  }
}

export default RefreshStrategy;