/**
 * 反检测机制模块
 * 随机延迟、鼠标轨迹模拟、人类化输入模式
 */

export class AntiDetect {
  /**
   * 生成随机延迟（毫秒）
   * 使用正态分布使延迟更自然
   */
  static randomDelay(min: number, max: number): number {
    const mean = (min + max) / 2;
    const stdDev = (max - min) / 6;

    // Box-Muller 变换生成正态分布
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

    let value = mean + z0 * stdDev;

    // 限制在范围内
    return Math.max(min, Math.min(max, Math.round(value)));
  }

  /**
   * 生成人类化的打字延迟
   * 模拟真实打字的停顿和速度变化
   */
  static typingDelay(): number {
    // 平均打字速度约 150-300ms 每字符
    // 偶尔有更长停顿（思考、换词）
    const baseDelay = this.randomDelay(50, 200);

    // 10% 概率产生长停顿
    if (Math.random() < 0.1) {
      return baseDelay + this.randomDelay(300, 800);
    }

    return baseDelay;
  }

  /**
   * 生成鼠标移动轨迹点
   * 使用贝塞尔曲线模拟人类鼠标移动
   */
  static generateMousePath(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    steps: number = 20
  ): Array<{ x: number; y: number }> {
    const path: Array<{ x: number; y: number }> = [];

    // 生成随机控制点
    const cp1x = startX + (endX - startX) * Math.random() * 0.5;
    const cp1y = startY + (endY - startY) * Math.random() * 0.5 - 50;
    const cp2x = startX + (endX - startX) * (0.5 + Math.random() * 0.5);
    const cp2y = startY + (endY - startY) * (0.5 + Math.random() * 0.5) + 50;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;

      // 三次贝塞尔曲线
      const x =
        Math.pow(1 - t, 3) * startX +
        3 * Math.pow(1 - t, 2) * t * cp1x +
        3 * (1 - t) * Math.pow(t, 2) * cp2x +
        Math.pow(t, 3) * endX;

      const y =
        Math.pow(1 - t, 3) * startY +
        3 * Math.pow(1 - t, 2) * t * cp1y +
        3 * (1 - t) * Math.pow(t, 2) * cp2y +
        Math.pow(t, 3) * endY;

      // 添加微小随机抖动
      const jitterX = (Math.random() - 0.5) * 2;
      const jitterY = (Math.random() - 0.5) * 2;

      path.push({
        x: Math.round(x + jitterX),
        y: Math.round(y + jitterY),
      });
    }

    return path;
  }

  /**
   * 生成随机用户代理
   */
  static getRandomUserAgent(): string {
    const userAgents = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    ];

    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  /**
   * 生成随机浏览器指纹参数
   */
  static getRandomFingerprint(): {
    viewport: { width: number; height: number };
    locale: string;
    timezone: string;
  } {
    const viewports = [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 1536, height: 864 },
      { width: 1440, height: 900 },
      { width: 2560, height: 1440 },
    ];

    const locales = ['zh-CN', 'zh-TW', 'en-US', 'en-GB'];
    const timezones = ['Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Taipei'];

    return {
      viewport: viewports[Math.floor(Math.random() * viewports.length)],
      locale: locales[Math.floor(Math.random() * locales.length)],
      timezone: timezones[Math.floor(Math.random() * timezones.length)],
    };
  }

  /**
   * 等待随机时间（模拟人类阅读/思考）
   */
  static async humanPause(minMs: number = 500, maxMs: number = 2000): Promise<void> {
    const delay = this.randomDelay(minMs, maxMs);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

export default AntiDetect;
