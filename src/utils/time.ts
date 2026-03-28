/**
 * 时间工具模块
 */

/**
 * 高精度计时器
 */
export class PrecisionTimer {
  private startTime: number = 0;
  private endTime: number = 0;

  start(): void {
    this.startTime = performance.now();
  }

  stop(): number {
    this.endTime = performance.now();
    return this.endTime - this.startTime;
  }

  getElapsed(): number {
    return performance.now() - this.startTime;
  }
}

/**
 * 等待到指定时间点
 */
export async function waitUntil(targetTime: Date): Promise<void> {
  const now = Date.now();
  const target = targetTime.getTime();
  const delay = target - now;

  if (delay > 0) {
    // 粗略等待
    if (delay > 100) {
      await sleep(delay - 50);
    }
    // 精确等待（busy wait）
    while (Date.now() < target) {
      // busy wait for precision
    }
  }
}

/**
 * 简单睡眠函数
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 格式化时间
 */
export function formatTime(date: Date): string {
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * 解析时间字符串
 */
export function parseTimeString(timeStr: string): Date {
  // 支持多种格式
  const formats = [
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/, // YYYY-MM-DD HH:MM:SS
    /^(\d{2}):(\d{2}):(\d{2})$/, // HH:MM:SS (今天)
    /^(\d{2}):(\d{2})$/, // HH:MM (今天)
  ];

  for (const format of formats) {
    const match = timeStr.match(format);
    if (match) {
      if (match.length === 7) {
        return new Date(
          parseInt(match[1]),
          parseInt(match[2]) - 1,
          parseInt(match[3]),
          parseInt(match[4]),
          parseInt(match[5]),
          parseInt(match[6])
        );
      } else if (match.length === 4) {
        const now = new Date();
        return new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          parseInt(match[1]),
          parseInt(match[2]),
          parseInt(match[3])
        );
      } else if (match.length === 3) {
        const now = new Date();
        return new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          parseInt(match[1]),
          parseInt(match[2]),
          0
        );
      }
    }
  }

  throw new Error(`无法解析时间字符串: ${timeStr}`);
}

/**
 * 计算剩余时间
 */
export function getRemainingTime(targetTime: Date): {
  totalMs: number;
  seconds: number;
  minutes: number;
  hours: number;
} {
  const now = Date.now();
  const target = targetTime.getTime();
  const diff = Math.max(0, target - now);

  return {
    totalMs: diff,
    seconds: Math.floor(diff / 1000),
    minutes: Math.floor(diff / 60000),
    hours: Math.floor(diff / 3600000),
  };
}

/**
 * 定时器管理器
 */
export class TimerManager {
  private timers: Map<string, NodeJS.Timeout> = new Map();

  set(name: string, callback: () => void, delay: number): void {
    if (this.timers.has(name)) {
      this.clear(name);
    }
    const timer = setTimeout(callback, delay);
    this.timers.set(name, timer);
  }

  clear(name: string): void {
    const timer = this.timers.get(name);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(name);
    }
  }

  clearAll(): void {
    for (const [name] of this.timers) {
      this.clear(name);
    }
  }
}

export default {
  PrecisionTimer,
  waitUntil,
  sleep,
  formatTime,
  parseTimeString,
  getRemainingTime,
  TimerManager,
};