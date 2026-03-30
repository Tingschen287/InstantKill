/**
 * 定时刷新策略模块
 * 精确到毫秒的定时刷新，支持多页面并行
 *
 * 功能清单 (B1):
 * - [x] 实现高精度定时器（performance API）
 * - [x] 实现多浏览器并行刷新
 * - [x] 实现刷新时间同步校准
 * - [x] 实现刷新频率动态调整
 * - [x] 实现刷新失败恢复
 */

import { Page, Browser } from 'playwright';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('RefreshStrategy');

// ==================== 类型定义 ====================

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
  onRefresh?: (attempt: number, latency: number) => void;
  /** 刷新失败的回调 */
  onError?: (error: Error, attempt: number) => void;
  /** 刷新成功（检测到变化）的回调 */
  onSuccess?: (attempt: number) => void;
  /** 等待页面加载的状态 */
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
  /** 超时时间 */
  timeout?: number;
}

export interface PreciseRefreshOptions {
  /** 目标时间 */
  targetTime: Date;
  /** 提前刷新次数（预热） */
  warmupCount?: number;
  /** 预热间隔比例（相对于总等待时间） */
  warmupRatio?: number;
  /** 刷新前检查 */
  preCheck?: () => Promise<boolean>;
  /** 刷新后检查 */
  postCheck?: () => Promise<boolean>;
  /** 允许的时间误差（毫秒） */
  tolerance?: number;
}

export interface ParallelRefreshOptions {
  /** 页面配置 */
  pages: Array<{
    page: Page;
    url?: string;
    label?: string;
  }>;
  /** 刷新间隔 */
  interval?: number;
  /** 是否同步刷新 */
  synchronized?: boolean;
  /** 最大刷新次数 */
  maxRefreshes?: number;
}

export interface RefreshStats {
  totalRefreshes: number;
  successfulRefreshes: number;
  failedRefreshes: number;
  averageLatency: number;
  minLatency: number;
  maxLatency: number;
  startTime: number;
  lastRefreshTime: number;
}

// ==================== 高精度定时器 ====================

export class HighPrecisionTimer {
  private static instance: HighPrecisionTimer;
  private offset: number = 0;
  private lastSyncTime: number = 0;

  private constructor() {
    this.sync();
  }

  static getInstance(): HighPrecisionTimer {
    if (!HighPrecisionTimer.instance) {
      HighPrecisionTimer.instance = new HighPrecisionTimer();
    }
    return HighPrecisionTimer.instance;
  }

  /**
   * 同步时间（可用于与服务器时间校准）
   */
  sync(serverTime?: number): void {
    if (serverTime !== undefined) {
      this.offset = serverTime - Date.now();
      this.lastSyncTime = Date.now();
      logger.debug(`时间同步: 偏移 ${this.offset}ms`);
    }
  }

  /**
   * 获取校准后的时间
   */
  now(): number {
    return Date.now() + this.offset;
  }

  /**
   * 获取高精度时间戳
   */
  getHighResTime(): number {
    return performance.now();
  }

  /**
   * 精确等待到指定时间
   */
  async waitUntil(targetTime: number): Promise<void> {
    const adjustedTarget = targetTime - this.offset;
    const now = Date.now();
    const delay = adjustedTarget - now;

    if (delay <= 0) return;

    // 分段等待：粗等待 + 精确等待
    if (delay > 100) {
      await this.sleep(delay - 50);
    }

    // 最后 50ms 使用忙等待确保精度
    while (Date.now() < adjustedTarget) {
      // 忙等待
    }
  }

  /**
   * 精确等待指定时间（使用 performance API）
   */
  async waitPrecise(ms: number): Promise<void> {
    if (ms <= 0) return;

    const start = performance.now();
    const target = start + ms;

    // 粗等待
    if (ms > 20) {
      await this.sleep(ms - 10);
    }

    // 精确等待
    while (performance.now() < target) {
      // 忙等待
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ==================== 刷新策略类 ====================

export class RefreshStrategy {
  private page: Page;
  private refreshCount: number = 0;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private stats: RefreshStats;
  private timer: HighPrecisionTimer;
  private latencies: number[] = [];

  constructor(page: Page) {
    this.page = page;
    this.timer = HighPrecisionTimer.getInstance();
    this.stats = {
      totalRefreshes: 0,
      successfulRefreshes: 0,
      failedRefreshes: 0,
      averageLatency: 0,
      minLatency: Infinity,
      maxLatency: 0,
      startTime: 0,
      lastRefreshTime: 0,
    };
  }

  // ==================== 基础刷新 ====================

  /**
   * 单次刷新
   */
  async refresh(options?: {
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
    timeout?: number;
  }): Promise<number> {
    const startTime = performance.now();

    await this.page.reload({
      waitUntil: options?.waitUntil ?? 'domcontentloaded',
      timeout: options?.timeout ?? 30000,
    });

    const latency = performance.now() - startTime;
    this.recordLatency(latency);

    return latency;
  }

  /**
   * 导航到指定 URL（等效于刷新）
   */
  async navigateTo(url: string, options?: RefreshOptions): Promise<number> {
    const startTime = performance.now();

    await this.page.goto(url, {
      waitUntil: options?.waitUntil ?? 'domcontentloaded',
      timeout: options?.timeout ?? 30000,
    });

    const latency = performance.now() - startTime;
    this.recordLatency(latency);

    return latency;
  }

  // ==================== 精确定时刷新 ====================

  /**
   * 精确定时刷新
   * 在指定时间点精确刷新页面
   */
  async refreshAtTargetTime(options: PreciseRefreshOptions): Promise<{
    success: boolean;
    latency: number;
    timingError: number;
    attempts: number;
  }> {
    const targetTime = options.targetTime.getTime();
    const now = this.timer.now();

    if (targetTime <= now) {
      throw new Error('目标时间必须是未来时间');
    }

    const warmupCount = options.warmupCount ?? 3;
    const tolerance = options.tolerance ?? 50;
    let attempts = 0;

    // 预热刷新
    if (warmupCount > 0) {
      const warmupRatio = options.warmupRatio ?? 0.8;
      const totalWait = targetTime - now;
      const warmupInterval = (totalWait * warmupRatio) / (warmupCount + 1);

      for (let i = 0; i < warmupCount; i++) {
        const warmupTime = now + warmupInterval * (i + 1);
        await this.timer.waitUntil(warmupTime);

        // 刷新前检查
        if (options.preCheck) {
          const shouldContinue = await options.preCheck();
          if (!shouldContinue) {
            logger.info('预热检查失败，终止刷新');
            return { success: false, latency: 0, timingError: 0, attempts };
          }
        }

        await this.refresh();
        attempts++;
        logger.debug(`预热刷新 ${i + 1}/${warmupCount}`);
      }
    }

    // 精确等待到目标时间
    await this.timer.waitUntil(targetTime - 5);

    // 最终刷新
    const refreshStart = performance.now();
    await this.refresh();
    const refreshEnd = performance.now();

    const actualTime = this.timer.now();
    const timingError = actualTime - targetTime;
    const latency = refreshEnd - refreshStart;
    attempts++;

    // 刷新后检查
    let success = true;
    if (options.postCheck) {
      success = await options.postCheck();
    }

    // 判断是否在允许误差范围内
    const onTime = Math.abs(timingError) <= tolerance;

    logger.info(
      `精确刷新完成: 延迟 ${latency.toFixed(0)}ms, ` +
      `时间误差 ${timingError.toFixed(0)}ms, ` +
      `准时: ${onTime}`
    );

    return {
      success: success && onTime,
      latency,
      timingError,
      attempts,
    };
  }

  // ==================== 循环刷新 ====================

  /**
   * 开始循环刷新
   */
  async startLoopRefresh(options: RefreshOptions): Promise<void> {
    this.isRunning = true;
    this.isPaused = false;
    this.stats.startTime = Date.now();

    const interval = options.interval ?? 1000;
    const maxRefreshes = options.maxRefreshes ?? Infinity;
    const waitUntil = options.waitUntil ?? 'domcontentloaded';
    const timeout = options.timeout ?? 30000;

    while (this.isRunning && this.refreshCount < maxRefreshes) {
      // 处理暂停
      if (this.isPaused) {
        await this.sleep(100);
        continue;
      }

      // 检查是否应该刷新
      if (options.shouldRefresh) {
        const should = await options.shouldRefresh();
        if (!should) {
          logger.debug('条件检查不满足，暂停刷新');
          await this.sleep(500);
          continue;
        }
      }

      // 执行刷新
      const startTime = performance.now();
      try {
        await this.page.reload({ waitUntil, timeout });
        const latency = performance.now() - startTime;

        this.refreshCount++;
        this.stats.totalRefreshes++;
        this.stats.successfulRefreshes++;
        this.stats.lastRefreshTime = Date.now();
        this.recordLatency(latency);

        options.onRefresh?.(this.refreshCount, latency);
      } catch (error) {
        this.stats.failedRefreshes++;
        options.onError?.(error as Error, this.refreshCount);
        logger.error(`刷新失败: ${(error as Error).message}`);
      }

      // 等待间隔
      await this.sleep(interval);
    }

    logger.info(`循环刷新结束，共刷新 ${this.refreshCount} 次`);
  }

  /**
   * 停止循环刷新
   */
  stopLoopRefresh(): void {
    this.isRunning = false;
    logger.info(`停止刷新，共刷新 ${this.refreshCount} 次`);
  }

  /**
   * 暂停刷新
   */
  pause(): void {
    this.isPaused = true;
    logger.debug('刷新已暂停');
  }

  /**
   * 恢复刷新
   */
  resume(): void {
    this.isPaused = false;
    logger.debug('刷新已恢复');
  }

  // ==================== 智能刷新 ====================

  /**
   * 智能刷新
   * 根据页面状态和响应时间动态调整刷新策略
   */
  async smartRefresh(options?: {
    onSuccess?: () => Promise<boolean>;
    maxAttempts?: number;
    initialInterval?: number;
    minInterval?: number;
    maxInterval?: number;
    backoffOnFailure?: boolean;
  }): Promise<boolean> {
    const maxAttempts = options?.maxAttempts ?? 10;
    let interval = options?.initialInterval ?? 1000;
    const minInterval = options?.minInterval ?? 100;
    const maxInterval = options?.maxInterval ?? 5000;
    const backoffOnFailure = options?.backoffOnFailure ?? true;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const latency = await this.refresh();

        // 检查成功条件
        if (options?.onSuccess) {
          const success = await options.onSuccess();
          if (success) {
            logger.info(`智能刷新成功，第 ${attempt} 次尝试`);
            return true;
          }
        }

        // 根据响应时间调整间隔
        if (latency < 500) {
          interval = Math.max(minInterval, interval * 0.8);
        } else if (latency > 2000) {
          interval = Math.min(maxInterval, interval * 1.2);
        }

        await this.sleep(interval);
      } catch (error) {
        if (backoffOnFailure) {
          interval = Math.min(maxInterval, interval * 2);
        }
        await this.sleep(interval);
      }
    }

    return false;
  }

  // ==================== 并行刷新 ====================

  /**
   * 多页面并行刷新
   */
  static async parallelRefresh(options: ParallelRefreshOptions): Promise<Map<string, RefreshStats>> {
    const results = new Map<string, RefreshStats>();
    const interval = options.interval ?? 1000;
    const maxRefreshes = options.maxRefreshes ?? Infinity;

    const refreshPromises = options.pages.map(async ({ page, url, label }) => {
      const strategy = new RefreshStrategy(page);
      const stats: RefreshStats = {
        totalRefreshes: 0,
        successfulRefreshes: 0,
        failedRefreshes: 0,
        averageLatency: 0,
        minLatency: Infinity,
        maxLatency: 0,
        startTime: Date.now(),
        lastRefreshTime: 0,
      };

      const latencies: number[] = [];

      for (let i = 0; i < maxRefreshes; i++) {
        try {
          const startTime = performance.now();

          if (url) {
            await page.goto(url, { waitUntil: 'domcontentloaded' });
          } else {
            await page.reload({ waitUntil: 'domcontentloaded' });
          }

          const latency = performance.now() - startTime;
          latencies.push(latency);

          stats.totalRefreshes++;
          stats.successfulRefreshes++;
          stats.lastRefreshTime = Date.now();
        } catch {
          stats.totalRefreshes++;
          stats.failedRefreshes++;
        }

        if (i < maxRefreshes - 1) {
          await new Promise((resolve) => setTimeout(resolve, interval));
        }
      }

      if (latencies.length > 0) {
        stats.averageLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
        stats.minLatency = Math.min(...latencies);
        stats.maxLatency = Math.max(...latencies);
      }

      results.set(label ?? page.url(), stats);
      return stats;
    });

    // 同步刷新或异步刷新
    if (options.synchronized) {
      await Promise.all(refreshPromises);
    } else {
      await Promise.allSettled(refreshPromises);
    }

    return results;
  }

  /**
   * 使用多个浏览器实例并行刷新
   */
  static async multiBrowserRefresh(
    browser: Browser,
    url: string,
    options?: {
      tabCount?: number;
      interval?: number;
      maxRefreshes?: number;
      onRefresh?: (tabIndex: number, attempt: number, latency: number) => void;
    }
  ): Promise<RefreshStats[]> {
    const tabCount = options?.tabCount ?? 3;
    const pages: Page[] = [];

    // 创建多个页面
    for (let i = 0; i < tabCount; i++) {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      pages.push(page);
    }

    const results = await this.parallelRefresh({
      pages: pages.map((p, i) => ({ page: p, label: `tab-${i}` })),
      interval: options?.interval,
      maxRefreshes: options?.maxRefreshes,
      synchronized: true,
    });

    // 关闭页面
    for (const page of pages) {
      await page.close();
    }

    return Array.from(results.values());
  }

  // ==================== 刷新失败恢复 ====================

  /**
   * 带自动恢复的刷新
   */
  async refreshWithRecovery(options?: {
    maxRetries?: number;
    retryDelay?: number;
    onRecovery?: (attempt: number) => void;
    checkPageHealth?: () => Promise<boolean>;
  }): Promise<{ success: boolean; latency: number; recoveries: number }> {
    const maxRetries = options?.maxRetries ?? 3;
    const retryDelay = options?.retryDelay ?? 1000;
    let recoveries = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const latency = await this.refresh();

        // 检查页面健康状态
        if (options?.checkPageHealth) {
          const healthy = await options.checkPageHealth();
          if (!healthy) {
            throw new Error('页面健康检查失败');
          }
        }

        return { success: true, latency, recoveries };
      } catch (error) {
        recoveries++;
        options?.onRecovery?.(attempt);
        logger.warn(`刷新失败，尝试恢复 (${attempt + 1}/${maxRetries})`);

        if (attempt < maxRetries) {
          await this.sleep(retryDelay);
        }
      }
    }

    return { success: false, latency: 0, recoveries };
  }

  // ==================== 统计信息 ====================

  /**
   * 记录延迟
   */
  private recordLatency(latency: number): void {
    this.latencies.push(latency);
    this.stats.minLatency = Math.min(this.stats.minLatency, latency);
    this.stats.maxLatency = Math.max(this.stats.maxLatency, latency);
    this.stats.averageLatency =
      this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;
  }

  /**
   * 获取统计信息
   */
  getStats(): RefreshStats {
    return { ...this.stats };
  }

  /**
   * 获取刷新计数
   */
  getRefreshCount(): number {
    return this.refreshCount;
  }

  /**
   * 检查是否正在运行
   */
  isActive(): boolean {
    return this.isRunning && !this.isPaused;
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.refreshCount = 0;
    this.isRunning = false;
    this.isPaused = false;
    this.latencies = [];
    this.stats = {
      totalRefreshes: 0,
      successfulRefreshes: 0,
      failedRefreshes: 0,
      averageLatency: 0,
      minLatency: Infinity,
      maxLatency: 0,
      startTime: 0,
      lastRefreshTime: 0,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default RefreshStrategy;