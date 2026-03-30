/**
 * 自动重试机制模块
 * 失败后智能重试，支持自定义重试策略
 *
 * 功能清单 (A4):
 * - [x] 实现指数退避重试策略
 * - [x] 实现最大重试次数限制
 * - [x] 实现失败原因分析和分类
 * - [x] 实现重试状态持久化
 * - [x] 实现手动干预接口
 * - [x] 多种重试策略（固定、指数、线性、抖动）
 * - [x] 重试条件判断
 * - [x] 超时控制
 */

import { createLogger } from '../utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';

const logger = createLogger('RetryManager');

// ==================== 类型定义 ====================

export type RetryStrategy = 'fixed' | 'linear' | 'exponential' | 'exponentialWithJitter';

export interface RetryOptions {
  /** 最大重试次数 */
  maxRetries: number;
  /** 初始延迟（毫秒） */
  initialDelay?: number;
  /** 最大延迟（毫秒） */
  maxDelay?: number;
  /** 退避因子（用于指数退避） */
  backoffFactor?: number;
  /** 重试策略 */
  strategy?: RetryStrategy;
  /** 重试前的检查函数 */
  shouldRetry?: (error: Error, attempt: number, context: RetryContext) => boolean;
  /** 重试时的回调 */
  onRetry?: (error: Error, attempt: number, delay: number, context: RetryContext) => void;
  /** 成功回调 */
  onSuccess?: (result: unknown, attempts: number, totalTime: number) => void;
  /** 最终失败回调 */
  onFinalFailure?: (error: Error, attempts: number, totalTime: number) => void;
  /** 操作超时时间（毫秒） */
  timeout?: number;
  /** 是否持久化重试状态 */
  persistState?: boolean;
  /** 状态持久化路径 */
  statePath?: string;
  /** 操作名称（用于日志和状态） */
  operationName?: string;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  errorType?: ErrorType;
  attempts: number;
  totalDelay: number;
  totalTime: number;
  retryHistory: RetryAttempt[];
}

export interface RetryAttempt {
  attemptNumber: number;
  timestamp: number;
  error?: Error;
  errorType?: ErrorType;
  delay: number;
  duration: number;
}

export interface RetryContext {
  operationName: string;
  attempts: number;
  totalDelay: number;
  startTime: number;
  lastError?: Error;
  retryHistory: RetryAttempt[];
}

export type ErrorType =
  | 'network'
  | 'timeout'
  | 'rate_limit'
  | 'server_error'
  | 'client_error'
  | 'validation'
  | 'unknown';

export interface PersistedState {
  operationName: string;
  attempts: number;
  lastError?: string;
  lastAttemptTime: number;
  status: 'in_progress' | 'completed' | 'failed';
}

// ==================== 错误分类器 ====================

export class ErrorClassifier {
  /**
   * 分析错误类型
   */
  static classify(error: Error): ErrorType {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // 网络错误
    if (
      name.includes('network') ||
      name.includes('enetunreach') ||
      name.includes('econnrefused') ||
      name.includes('econnreset') ||
      name.includes('edns') ||
      message.includes('network') ||
      message.includes('连接') ||
      message.includes('网络')
    ) {
      return 'network';
    }

    // 超时错误
    if (
      name.includes('timeout') ||
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('超时')
    ) {
      return 'timeout';
    }

    // 速率限制
    if (
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('429') ||
      message.includes('频率') ||
      message.includes('限制')
    ) {
      return 'rate_limit';
    }

    // 服务器错误
    if (
      message.includes('500') ||
      message.includes('502') ||
      message.includes('503') ||
      message.includes('504') ||
      message.includes('internal server error') ||
      message.includes('bad gateway') ||
      message.includes('service unavailable') ||
      message.includes('gateway timeout')
    ) {
      return 'server_error';
    }

    // 客户端错误
    if (
      message.includes('400') ||
      message.includes('401') ||
      message.includes('403') ||
      message.includes('404') ||
      message.includes('bad request') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('not found')
    ) {
      return 'client_error';
    }

    // 验证错误
    if (
      name.includes('validation') ||
      message.includes('validation') ||
      message.includes('invalid') ||
      message.includes('验证')
    ) {
      return 'validation';
    }

    return 'unknown';
  }

  /**
   * 判断错误是否可重试
   */
  static isRetryable(error: Error): boolean {
    const type = this.classify(error);

    // 网络错误、超时、速率限制、服务器错误通常可以重试
    const retryableTypes: ErrorType[] = ['network', 'timeout', 'rate_limit', 'server_error'];

    return retryableTypes.includes(type);
  }

  /**
   * 获取建议的重试延迟
   */
  static getSuggestedDelay(error: Error): number {
    const type = this.classify(error);

    switch (type) {
      case 'rate_limit':
        return 5000; // 速率限制时等待更长时间
      case 'server_error':
        return 3000; // 服务器错误时适度等待
      case 'network':
        return 1000; // 网络错误时稍等
      case 'timeout':
        return 500; // 超时后快速重试
      default:
        return 1000;
    }
  }
}

// ==================== 重试策略计算器 ====================

export class DelayCalculator {
  /**
   * 计算延迟时间
   */
  static calculate(
    strategy: RetryStrategy,
    attempt: number,
    options: {
      initialDelay: number;
      maxDelay: number;
      backoffFactor: number;
    }
  ): number {
    let delay: number;

    switch (strategy) {
      case 'fixed':
        delay = options.initialDelay;
        break;

      case 'linear':
        delay = options.initialDelay * attempt;
        break;

      case 'exponential':
        delay = options.initialDelay * Math.pow(options.backoffFactor, attempt - 1);
        break;

      case 'exponentialWithJitter':
        // 指数退避 + 随机抖动（防止惊群效应）
        const baseDelay = options.initialDelay * Math.pow(options.backoffFactor, attempt - 1);
        const jitter = baseDelay * 0.2 * Math.random(); // 20% 抖动
        delay = baseDelay + jitter;
        break;

      default:
        delay = options.initialDelay;
    }

    // 限制最大延迟
    return Math.min(delay, options.maxDelay);
  }
}

// ==================== 状态持久化 ====================

export class StatePersistence {
  private statePath: string;

  constructor(statePath: string) {
    this.statePath = statePath;
    this.ensureDirectory();
  }

  private ensureDirectory(): void {
    const dir = path.dirname(this.statePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  save(state: PersistedState): void {
    fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2));
  }

  load(): PersistedState | null {
    if (!fs.existsSync(this.statePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(this.statePath, 'utf-8');
      return JSON.parse(content) as PersistedState;
    } catch {
      return null;
    }
  }

  clear(): void {
    if (fs.existsSync(this.statePath)) {
      fs.unlinkSync(this.statePath);
    }
  }
}

// ==================== 重试管理器 ====================

export class RetryManager {
  private options: Required<RetryOptions>;
  private statePersistence: StatePersistence | null = null;
  private isAborted: boolean = false;
  private isPaused: boolean = false;
  private pauseResolver: (() => void) | null = null;

  constructor(options: RetryOptions) {
    this.options = {
      maxRetries: options.maxRetries,
      initialDelay: options.initialDelay ?? 1000,
      maxDelay: options.maxDelay ?? 60000,
      backoffFactor: options.backoffFactor ?? 2,
      strategy: options.strategy ?? 'exponentialWithJitter',
      shouldRetry: options.shouldRetry ?? ((error) => ErrorClassifier.isRetryable(error)),
      onRetry: options.onRetry ?? (() => {}),
      onSuccess: options.onSuccess ?? (() => {}),
      onFinalFailure: options.onFinalFailure ?? (() => {}),
      timeout: options.timeout ?? 0, // 0 表示无超时
      persistState: options.persistState ?? false,
      statePath: options.statePath ?? './.retry-state.json',
      operationName: options.operationName ?? 'operation',
    };

    if (this.options.persistState) {
      this.statePersistence = new StatePersistence(this.options.statePath);
    }
  }

  /**
   * 执行带重试的异步操作
   */
  async execute<T>(operation: () => Promise<T>): Promise<RetryResult<T>> {
    const startTime = Date.now();
    const context: RetryContext = {
      operationName: this.options.operationName,
      attempts: 0,
      totalDelay: 0,
      startTime,
      retryHistory: [],
    };

    // 恢复之前的状态（如果启用持久化）
    if (this.statePersistence) {
      const savedState = this.statePersistence.load();
      if (savedState && savedState.status === 'in_progress') {
        context.attempts = savedState.attempts;
        logger.info(`从持久化状态恢复: 已尝试 ${savedState.attempts} 次`);
      }
    }

    this.isAborted = false;
    this.isPaused = false;

    while (context.attempts <= this.options.maxRetries) {
      // 检查是否被中止
      if (this.isAborted) {
        logger.warn('操作被手动中止');
        return {
          success: false,
          error: new Error('Operation aborted'),
          errorType: 'client_error',
          attempts: context.attempts,
          totalDelay: context.totalDelay,
          totalTime: Date.now() - startTime,
          retryHistory: context.retryHistory,
        };
      }

      // 处理暂停
      if (this.isPaused) {
        await new Promise<void>((resolve) => {
          this.pauseResolver = resolve;
        });
      }

      const attemptStart = Date.now();
      context.attempts++;

      try {
        // 执行操作（可选超时）
        const result = this.options.timeout > 0
          ? await this.withTimeout(operation(), this.options.timeout)
          : await operation();

        // 成功
        const totalTime = Date.now() - startTime;
        this.options.onSuccess(result, context.attempts, totalTime);
        this.clearPersistedState();

        logger.info(`${this.options.operationName} 成功，共尝试 ${context.attempts} 次，耗时 ${totalTime}ms`);

        return {
          success: true,
          result,
          attempts: context.attempts,
          totalDelay: context.totalDelay,
          totalTime,
          retryHistory: context.retryHistory,
        };
      } catch (error) {
        const err = error as Error;
        const errorType = ErrorClassifier.classify(err);
        const attemptDuration = Date.now() - attemptStart;

        // 记录尝试
        const attemptRecord: RetryAttempt = {
          attemptNumber: context.attempts,
          timestamp: attemptStart,
          error: err,
          errorType,
          delay: 0, // 稍后计算
          duration: attemptDuration,
        };

        // 检查是否应该重试
        const shouldRetry = this.options.shouldRetry(err, context.attempts, context);

        if (context.attempts > this.options.maxRetries || !shouldRetry) {
          // 不再重试
          const totalTime = Date.now() - startTime;
          this.options.onFinalFailure(err, context.attempts, totalTime);

          logger.error(
            `${this.options.operationName} 最终失败: ${err.message}，` +
            `尝试 ${context.attempts} 次，耗时 ${totalTime}ms`
          );

          this.clearPersistedState();

          return {
            success: false,
            error: err,
            errorType,
            attempts: context.attempts,
            totalDelay: context.totalDelay,
            totalTime,
            retryHistory: context.retryHistory,
          };
        }

        // 计算延迟
        const delay = DelayCalculator.calculate(
          this.options.strategy,
          context.attempts,
          {
            initialDelay: this.options.initialDelay,
            maxDelay: this.options.maxDelay,
            backoffFactor: this.options.backoffFactor,
          }
        );

        attemptRecord.delay = delay;
        context.retryHistory.push(attemptRecord);
        context.totalDelay += delay;
        context.lastError = err;

        // 持久化状态
        this.saveState(context);

        // 触发重试回调
        this.options.onRetry(err, context.attempts, delay, context);

        logger.warn(
          `${this.options.operationName} 失败 [${errorType}]: ${err.message}，` +
          `第 ${context.attempts} 次重试，等待 ${delay.toFixed(0)}ms`
        );

        // 等待后重试
        await this.sleep(delay);
      }
    }

    // 不应该到达这里
    return {
      success: false,
      error: new Error('Max retries exceeded'),
      errorType: 'unknown',
      attempts: context.attempts,
      totalDelay: context.totalDelay,
      totalTime: Date.now() - startTime,
      retryHistory: context.retryHistory,
    };
  }

  /**
   * 手动中止操作
   */
  abort(): void {
    this.isAborted = true;
    logger.info('请求中止操作');
  }

  /**
   * 暂停重试
   */
  pause(): void {
    this.isPaused = true;
    logger.info('暂停重试');
  }

  /**
   * 恢复重试
   */
  resume(): void {
    this.isPaused = false;
    if (this.pauseResolver) {
      this.pauseResolver();
      this.pauseResolver = null;
    }
    logger.info('恢复重试');
  }

  /**
   * 获取当前状态
   */
  getState(): PersistedState | null {
    if (!this.statePersistence) return null;
    return this.statePersistence.load();
  }

  /**
   * 清除持久化状态
   */
  clearPersistedState(): void {
    if (this.statePersistence) {
      this.statePersistence.clear();
    }
  }

  // ==================== 私有方法 ====================

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timeout after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  private saveState(context: RetryContext): void {
    if (!this.statePersistence) return;

    this.statePersistence.save({
      operationName: context.operationName,
      attempts: context.attempts,
      lastError: context.lastError?.message,
      lastAttemptTime: Date.now(),
      status: 'in_progress',
    });
  }
}

// ==================== 便捷方法 ====================

/**
 * 快速重试（用于抢票场景）
 */
export async function quickRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 5,
  delayMs: number = 100
): Promise<T> {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}

/**
 * 无限重试直到成功
 */
export async function retryUntilSuccess<T>(
  operation: () => Promise<T>,
  options?: {
    interval?: number;
    maxAttempts?: number;
    onSuccess?: (result: T) => boolean;
    onAttempt?: (attempt: number) => void;
  }
): Promise<T> {
  const interval = options?.interval ?? 1000;
  const maxAttempts = options?.maxAttempts ?? Infinity;
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    options?.onAttempt?.(attempts);

    try {
      const result = await operation();

      if (options?.onSuccess) {
        if (options.onSuccess(result)) {
          return result;
        }
      } else {
        return result;
      }
    } catch {
      // 忽略错误，继续重试
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`retryUntilSuccess: max attempts (${maxAttempts}) exceeded`);
}

/**
 * 带条件的重试
 */
export async function retryWithCondition<T>(
  operation: () => Promise<T>,
  condition: (result: T) => boolean,
  options?: {
    maxRetries?: number;
    delay?: number;
  }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const delay = options?.delay ?? 1000;

  for (let i = 0; i < maxRetries; i++) {
    const result = await operation();
    if (condition(result)) {
      return result;
    }
    if (i < maxRetries - 1) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error('retryWithCondition: condition not met after max retries');
}

/**
 * 批量重试
 */
export async function retryBatch<T>(
  operations: Array<() => Promise<T>>,
  options?: {
    maxRetries?: number;
    concurrency?: number;
    stopOnFirstSuccess?: boolean;
  }
): Promise<Map<number, RetryResult<T>>> {
  const results = new Map<number, RetryResult<T>>();
  const maxRetries = options?.maxRetries ?? 3;
  const concurrency = options?.concurrency ?? 1;

  const manager = new RetryManager({
    maxRetries,
    operationName: 'batch',
  });

  // 分批执行
  for (let i = 0; i < operations.length; i += concurrency) {
    const batch = operations.slice(i, Math.min(i + concurrency, operations.length));

    const batchResults = await Promise.all(
      batch.map(async (op, idx) => {
        const result = await manager.execute(op);
        results.set(i + idx, result);
        return result;
      })
    );

    // 如果设置了第一个成功就停止
    if (options?.stopOnFirstSuccess) {
      const successResult = batchResults.find((r) => r.success);
      if (successResult) {
        break;
      }
    }
  }

  return results;
}

export default RetryManager;