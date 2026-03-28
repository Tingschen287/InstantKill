/**
 * 自动重试机制模块
 * 失败后智能重试，支持自定义重试策略
 */

export interface RetryOptions {
  /** 最大重试次数 */
  maxRetries: number;
  /** 初始延迟（毫秒） */
  initialDelay?: number;
  /** 最大延迟（毫秒） */
  maxDelay?: number;
  /** 退避因子 */
  backoffFactor?: number;
  /** 重试前的检查函数 */
  shouldRetry?: (error: Error, attempt: number) => boolean;
  /** 重试时的回调 */
  onRetry?: (error: Error, attempt: number, delay: number) => void;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalDelay: number;
}

export class RetryManager {
  private options: Required<RetryOptions>;

  constructor(options: RetryOptions) {
    this.options = {
      maxRetries: options.maxRetries,
      initialDelay: options.initialDelay ?? 1000,
      maxDelay: options.maxDelay ?? 30000,
      backoffFactor: options.backoffFactor ?? 2,
      shouldRetry: options.shouldRetry ?? (() => true),
      onRetry: options.onRetry ?? (() => {}),
    };
  }

  /**
   * 执行带重试的异步操作
   */
  async execute<T>(
    operation: () => Promise<T>,
    operationName: string = 'operation'
  ): Promise<RetryResult<T>> {
    let attempt = 0;
    let totalDelay = 0;

    while (attempt <= this.options.maxRetries) {
      try {
        const result = await operation();
        return {
          success: true,
          result,
          attempts: attempt + 1,
          totalDelay,
        };
      } catch (error) {
        attempt++;

        if (attempt > this.options.maxRetries) {
          return {
            success: false,
            error: error as Error,
            attempts: attempt,
            totalDelay,
          };
        }

        // 检查是否应该重试
        if (!this.options.shouldRetry(error as Error, attempt)) {
          return {
            success: false,
            error: error as Error,
            attempts: attempt,
            totalDelay,
          };
        }

        // 计算延迟（指数退避）
        const delay = Math.min(
          this.options.initialDelay * Math.pow(this.options.backoffFactor, attempt - 1),
          this.options.maxDelay
        );

        totalDelay += delay;

        // 触发重试回调
        this.options.onRetry(error as Error, attempt, delay);

        console.log(
          `[RetryManager] ${operationName} 失败，第 ${attempt} 次重试，等待 ${delay}ms`
        );

        // 等待后重试
        await this.sleep(delay);
      }
    }

    return {
      success: false,
      error: new Error('Max retries exceeded'),
      attempts: attempt,
      totalDelay,
    };
  }

  /**
   * 快速重试（用于抢票场景）
   */
  static async quickRetry<T>(
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
  static async retryUntilSuccess<T>(
    operation: () => Promise<T>,
    options?: {
      interval?: number;
      maxAttempts?: number;
      onSuccess?: (result: T) => boolean;
    }
  ): Promise<T> {
    const interval = options?.interval ?? 1000;
    const maxAttempts = options?.maxAttempts ?? Infinity;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const result = await operation();

        // 如果有成功检查函数，验证是否真正成功
        if (options?.onSuccess) {
          if (options.onSuccess(result)) {
            return result;
          }
        } else {
          return result;
        }
      } catch (error) {
        // 忽略错误，继续重试
      }

      attempts++;
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new Error(`RetryUntilSuccess: max attempts (${maxAttempts}) exceeded`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default RetryManager;
