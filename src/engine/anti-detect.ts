/**
 * 反检测机制模块
 * 随机延迟、鼠标轨迹模拟、人类化输入模式、浏览器指纹随机化
 *
 * 功能清单 (A2):
 * - [x] 实现随机延迟函数（符合人类操作时间分布）
 * - [x] 实现鼠标轨迹模拟（贝塞尔曲线路径）
 * - [x] 实现人类化打字速度（随机停顿、回退重打）
 * - [x] 实现浏览器指纹随机化
 * - [x] 实现 Webdriver 特征隐藏
 * - [x] 鼠标滚动模拟
 * - [x] 页面浏览行为模拟
 * - [x] 点击位置随机偏移
 */

import { Page, BrowserContext } from 'playwright';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('AntiDetect');

// 用户代理池 - 更新到最新版本
const USER_AGENTS = {
  chrome: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  ],
  safari: [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  ],
  firefox: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0',
    'Mozilla/5.0 (X11; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0',
  ],
  edge: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0',
  ],
};

// 视口尺寸池
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 2560, height: 1440 },
  { width: 1280, height: 720 },
  { width: 1680, height: 1050 },
];

// 语言和时区配置
const LOCALES = ['zh-CN', 'zh-TW', 'zh-HK', 'en-US', 'en-GB', 'ja-JP'];
const TIMEZONES = ['Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Taipei', 'Asia/Tokyo'];

// Webdriver 隐藏脚本
const WEBDRIVER_HIDE_SCRIPT = `
// 隠除 navigator.webdriver 属性
Object.defineProperty(navigator, 'webdriver', {
  get: () => undefined,
  configurable: true
});

// 隐藏自动化相关属性
Object.defineProperty(navigator, 'plugins', {
  get: () => [1, 2, 3, 4, 5],
});

Object.defineProperty(navigator, 'languages', {
  get: () => ['zh-CN', 'zh', 'en-US', 'en'],
});

// 隐藏 Chrome 自动化标志
window.chrome = {
  app: {
    isInstalled: false,
    InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
    RunningState: { NOT_RUNNING: 'not_running', RUNNING: 'running', CANNOT_RUN: 'cannot_run' }
  },
  runtime: {},
  loadTimes: function() {},
  csi: function() {},
};

// 修改 permissions API
const originalQuery = window.navigator.permissions.query;
window.navigator.permissions.query = (parameters) => (
  parameters.name === 'notifications' ?
    Promise.resolve({ state: Notification.permission }) :
    originalQuery(parameters)
);

// 障碍检测绕过
const getParameter = WebGLRenderingContext.prototype.getParameter;
WebGLRenderingContext.prototype.getParameter = function(parameter) {
  if (parameter === 37445) {
    return 'Intel Inc.';
  }
  if (parameter === 37446) {
    return 'Intel Iris OpenGL Engine';
  }
  return getParameter.call(this, parameter);
};

// Canvas 指纹随机化
const toBlob = HTMLCanvasElement.prototype.toBlob;
const toDataURL = HTMLCanvasElement.prototype.toDataURL;
const getImageData = CanvasRenderingContext2D.prototype.getImageData;

const randomNoise = () => {
  const rand = Math.random() * 0.0000001;
  return rand;
};

HTMLCanvasElement.prototype.toBlob = function(...args) {
  if (this.width > 0 && this.height > 0) {
    const context = this.getContext('2d');
    if (context) {
      const imageData = getImageData.call(context, 0, 0, this.width, this.height);
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] += randomNoise();
        imageData.data[i+1] += randomNoise();
        imageData.data[i+2] += randomNoise();
      }
      context.putImageData(imageData, 0, 0);
    }
  }
  return toBlob.apply(this, args);
};

HTMLCanvasElement.prototype.toDataURL = function(...args) {
  if (this.width > 0 && this.height > 0) {
    const context = this.getContext('2d');
    if (context) {
      const imageData = getImageData.call(context, 0, 0, this.width, this.height);
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] += randomNoise();
        imageData.data[i+1] += randomNoise();
        imageData.data[i+2] += randomNoise();
      }
      context.putImageData(imageData, 0, 0);
    }
  }
  return toDataURL.apply(this, args);
};

console.log('[AntiDetect] Webdriver 特征已隐藏');
`;

export interface FingerprintConfig {
  userAgent: string;
  viewport: { width: number; height: number };
  locale: string;
  timezone: string;
  colorScheme: 'light' | 'dark';
  deviceScaleFactor: number;
  hasTouch: boolean;
  isMobile: boolean;
}

export interface HumanBehaviorConfig {
  /** 打字速度范围（每字符延迟 ms） */
  typingSpeed?: { min: number; max: number };
  /** 点击位置偏移范围（像素） */
  clickOffset?: { min: number; max: number };
  /** 鼠标移动速度 */
  mouseSpeed?: { min: number; max: number };
  /** 是否模拟打字错误 */
  simulateTypos?: boolean;
  /** 打字错误概率 */
  typoProbability?: number;
}

export class AntiDetect {
  private config: HumanBehaviorConfig;

  constructor(config?: HumanBehaviorConfig) {
    this.config = {
      typingSpeed: config?.typingSpeed ?? { min: 50, max: 150 },
      clickOffset: config?.clickOffset ?? { min: 2, max: 10 },
      mouseSpeed: config?.mouseSpeed ?? { min: 5, max: 15 },
      simulateTypos: config?.simulateTypos ?? true,
      typoProbability: config?.typoProbability ?? 0.02,
    };
  }

  // ==================== 随机延迟 ====================

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
   * 生成指数分布延迟（用于等待事件）
   */
  static exponentialDelay(mean: number): number {
    return Math.round(-mean * Math.log(Math.random()));
  }

  /**
   * 生成人类化的打字延迟
   */
  static typingDelay(): number {
    const baseDelay = this.randomDelay(50, 200);

    // 10% 概率产生长停顿（思考）
    if (Math.random() < 0.1) {
      return baseDelay + this.randomDelay(300, 800);
    }

    return baseDelay;
  }

  /**
   * 等待随机时间（模拟人类阅读/思考）
   */
  static async humanPause(minMs: number = 500, maxMs: number = 2000): Promise<void> {
    const delay = this.randomDelay(minMs, maxMs);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  // ==================== 鼠标轨迹模拟 ====================

  /**
   * 生成鼠标移动轨迹点
   * 使用贝塞尔曲线模拟人类鼠标移动
   */
  static generateMousePath(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    options?: {
      steps?: number;
      curvature?: number;
    }
  ): Array<{ x: number; y: number; delay: number }> {
    const steps = options?.steps ?? Math.max(10, Math.min(30, Math.abs(endX - startX) / 10));
    const curvature = options?.curvature ?? 0.5;
    const path: Array<{ x: number; y: number; delay: number }> = [];

    // 生成随机控制点（模拟手部抖动）
    const cp1x = startX + (endX - startX) * Math.random() * curvature;
    const cp1y = startY + (endY - startY) * Math.random() * curvature - 30 + Math.random() * 60;
    const cp2x = startX + (endX - startX) * (1 - curvature + Math.random() * curvature);
    const cp2y = startY + (endY - startY) * (1 - curvature + Math.random() * curvature) - 30 + Math.random() * 60;

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

      // 添加微小随机抖动（模拟手部不稳）
      const jitterX = (Math.random() - 0.5) * 2;
      const jitterY = (Math.random() - 0.5) * 2;

      // 计算延迟（开始慢，中间快，结束慢）
      const delayFactor = Math.sin(t * Math.PI) * 0.5 + 0.5;
      const baseDelay = this.randomDelay(5, 20);
      const delay = Math.round(baseDelay * (1 + delayFactor));

      path.push({
        x: Math.round(x + jitterX),
        y: Math.round(y + jitterY),
        delay,
      });
    }

    return path;
  }

  /**
   * 模拟鼠标移动到元素
   */
  async moveMouseToElement(
    page: Page,
    selector: string,
    options?: {
      offset?: { x: number; y: number };
      speed?: 'fast' | 'normal' | 'slow';
    }
  ): Promise<void> {
    const element = await page.$(selector);
    if (!element) {
      throw new Error(`元素不存在: ${selector}`);
    }

    const box = await element.boundingBox();
    if (!box) {
      throw new Error(`无法获取元素位置: ${selector}`);
    }

    // 计算目标位置（元素中心 + 随机偏移）
    const offset = options?.offset ?? { x: 0, y: 0 };
    const randomOffsetX = this.randomDelay(this.config.clickOffset!.min, this.config.clickOffset!.max) * (Math.random() > 0.5 ? 1 : -1);
    const randomOffsetY = this.randomDelay(this.config.clickOffset!.min, this.config.clickOffset!.max) * (Math.random() > 0.5 ? 1 : -1);

    const targetX = box.x + box.width / 2 + offset.x + randomOffsetX;
    const targetY = box.y + box.height / 2 + offset.y + randomOffsetY;

    // 获取当前鼠标位置（假设在页面中心）
    const viewport = page.viewportSize() ?? { width: 1920, height: 1080 };
    const startX = viewport.width / 2;
    const startY = viewport.height / 2;

    // 生成轨迹
    const speedSteps = { fast: 10, normal: 20, slow: 30 };
    const steps = speedSteps[options?.speed ?? 'normal'];
    const path = AntiDetect.generateMousePath(startX, startY, targetX, targetY, { steps });

    // 按轨迹移动
    for (const point of path) {
      await page.mouse.move(point.x, point.y);
      await new Promise((resolve) => setTimeout(resolve, point.delay));
    }

    logger.debug(`鼠标移动到: (${Math.round(targetX)}, ${Math.round(targetY)})`);
  }

  // ==================== 打字模拟 ====================

  /**
   * 模拟人类打字
   */
  async humanType(page: Page, selector: string, text: string): Promise<void> {
    await page.click(selector); // 先聚焦

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // 计算延迟
      const delay = AntiDetect.typingDelay();
      await new Promise((resolve) => setTimeout(resolve, delay));

      // 模拟打字错误
      if (this.config.simulateTypos && Math.random() < this.config.typoProbability! && i > 2) {
        // 输入一个错误的字符
        const wrongChar = this.getRandomWrongChar(char);
        await page.type(selector, wrongChar);

        // 等待发现错误
        await new Promise((resolve) => setTimeout(resolve, AntiDetect.randomDelay(100, 300)));

        // 删除错误字符
        await page.press(selector, 'Backspace');

        // 等待纠正
        await new Promise((resolve) => setTimeout(resolve, AntiDetect.randomDelay(50, 150)));

        // 输入正确的字符
        await page.type(selector, char);

        logger.debug(`模拟打字错误: ${wrongChar} -> ${char}`);
      } else {
        await page.type(selector, char);
      }

      // 偶尔停顿（模拟思考）
      if (Math.random() < 0.05) {
        await AntiDetect.humanPause(200, 500);
      }
    }

    logger.debug(`人类化打字完成: ${text}`);
  }

  /**
   * 获取一个随机错误字符
   */
  private getRandomWrongChar(char: string): string {
    // 常见的打字错误模式
    const adjacentKeys: Record<string, string[]> = {
      'a': ['q', 's', 'z'],
      'b': ['v', 'g', 'h', 'n'],
      'c': ['x', 'd', 'f', 'v'],
      'd': ['s', 'e', 'r', 'f', 'c', 'x'],
      'e': ['w', 'r', 'd', 's'],
      'f': ['d', 'g', 'v', 'c', 'r', 't'],
      'g': ['f', 'h', 'b', 'v', 't', 'y'],
      'h': ['g', 'j', 'n', 'b', 'y', 'u'],
      'i': ['u', 'o', 'k', 'j'],
      'j': ['h', 'k', 'm', 'n', 'u', 'i'],
      'k': ['j', 'l', 'm', 'o', 'i'],
      'l': ['k', 'o', 'p'],
      'm': ['n', 'j', 'k', 'l'],
      'n': ['b', 'h', 'j', 'm'],
      'o': ['i', 'p', 'l', 'k'],
      'p': ['o', 'l'],
      'q': ['a', 'w', 's'],
      'r': ['e', 't', 'f', 'd'],
      's': ['a', 'd', 'w', 'e', 'z', 'x'],
      't': ['r', 'y', 'g', 'f'],
      'u': ['y', 'i', 'j', 'h'],
      'v': ['c', 'f', 'g', 'h', 'b'],
      'w': ['q', 'e', 's', 'a'],
      'x': ['z', 's', 'd', 'c'],
      'y': ['t', 'u', 'h', 'g'],
      'z': ['a', 's', 'x'],
      '0': ['9', 'p', 'o'],
      '1': ['2', 'q'],
      '2': ['1', '3', 'w', 'q'],
      '3': ['2', '4', 'e', 'w'],
      '4': ['3', '5', 'r', 'e'],
      '5': ['4', '6', 't', 'r'],
      '6': ['5', '7', 'y', 't'],
      '7': ['6', '8', 'u', 'y'],
      '8': ['7', '9', 'i', 'u'],
      '9': ['8', '0', 'o', 'i'],
    };

    const lowerChar = char.toLowerCase();
    if (adjacentKeys[lowerChar]) {
      const wrongOptions = adjacentKeys[lowerChar];
      const wrongChar = wrongOptions[Math.floor(Math.random() * wrongOptions.length)];
      return char === char.toUpperCase() ? wrongChar.toUpperCase() : wrongChar;
    }

    return char;
  }

  // ==================== 点击模拟 ====================

  /**
   * 模拟人类点击
   */
  async humanClick(
    page: Page,
    selector: string,
    options?: {
      doubleClick?: boolean;
      delayBeforeClick?: number;
    }
  ): Promise<void> {
    // 移动鼠标到元素
    await this.moveMouseToElement(page, selector);

    // 点击前短暂停顿（模拟人类反应时间）
    const preDelay = options?.delayBeforeClick ?? AntiDetect.randomDelay(50, 200);
    await new Promise((resolve) => setTimeout(resolve, preDelay));

    // 执行点击
    if (options?.doubleClick) {
      await page.mouse.click(
        await this.getElementClickPosition(page, selector).then(p => p.x),
        await this.getElementClickPosition(page, selector).then(p => p.y),
        { clickCount: 2 }
      );
    } else {
      const pos = await this.getElementClickPosition(page, selector);
      await page.mouse.click(pos.x, pos.y);
    }

    logger.debug(`人类化点击: ${selector}`);
  }

  /**
   * 获取元素点击位置（带随机偏移）
   */
  private async getElementClickPosition(page: Page, selector: string): Promise<{ x: number; y: number }> {
    const element = await page.$(selector);
    if (!element) throw new Error(`元素不存在: ${selector}`);

    const box = await element.boundingBox();
    if (!box) throw new Error(`无法获取元素位置: ${selector}`);

    const randomOffsetX = this.randomDelay(this.config.clickOffset!.min, this.config.clickOffset!.max) * (Math.random() > 0.5 ? 1 : -1);
    const randomOffsetY = this.randomDelay(this.config.clickOffset!.min, this.config.clickOffset!.max) * (Math.random() > 0.5 ? 1 : -1);

    return {
      x: box.x + box.width / 2 + randomOffsetX,
      y: box.y + box.height / 2 + randomOffsetY,
    };
  }

  // ==================== 滚动模拟 ====================

  /**
   * 模拟人类滚动
   */
  async humanScroll(
    page: Page,
    direction: 'up' | 'down',
    options?: {
      distance?: number;
      speed?: 'fast' | 'normal' | 'slow';
    }
  ): Promise<void> {
    const distance = options?.distance ?? 300;
    const deltaY = direction === 'down' ? distance : -distance;

    // 分多次滚动（模拟真实滚动）
    const scrollSteps = Math.ceil(distance / 50);
    const stepDistance = deltaY / scrollSteps;

    for (let i = 0; i < scrollSteps; i++) {
      await page.mouse.wheel(0, stepDistance);
      await new Promise((resolve) => setTimeout(resolve, AntiDetect.randomDelay(30, 80)));
    }

    logger.debug(`人类化滚动: ${direction} ${distance}px`);
  }

  /**
   * 模拟浏览页面（随机滚动）
   */
  async browsePage(page: Page, durationMs: number = 3000): Promise<void> {
    const steps = Math.floor(durationMs / 500);

    for (let i = 0; i < steps; i++) {
      // 随机决定滚动方向
      const direction = Math.random() > 0.3 ? 'down' : 'up';
      const distance = AntiDetect.randomDelay(100, 400);

      await this.humanScroll(page, direction, { distance });

      // 随机停顿（模拟阅读）
      await AntiDetect.humanPause(200, 800);
    }

    logger.debug('页面浏览模拟完成');
  }

  // ==================== 浏览器指纹 ====================

  /**
   * 生成随机用户代理
   */
  static getRandomUserAgent(browserType?: 'chrome' | 'safari' | 'firefox' | 'edge'): string {
    const type = browserType ?? (Math.random() > 0.8 ? 'chrome' : 'chrome');
    const agents = USER_AGENTS[type];
    return agents[Math.floor(Math.random() * agents.length)];
  }

  /**
   * 生成完整的浏览器指纹配置
   */
  static generateFingerprint(): FingerprintConfig {
    return {
      userAgent: this.getRandomUserAgent(),
      viewport: VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)],
      locale: LOCALES[Math.floor(Math.random() * LOCALES.length)],
      timezone: TIMEZONES[Math.floor(Math.random() * TIMEZONES.length)],
      colorScheme: Math.random() > 0.7 ? 'dark' : 'light',
      deviceScaleFactor: Math.random() > 0.8 ? 2 : 1,
      hasTouch: Math.random() > 0.9,
      isMobile: false,
    };
  }

  /**
   * 应用指纹配置到浏览器上下文
   */
  static async applyFingerprint(context: BrowserContext, fingerprint?: FingerprintConfig): Promise<void> {
    const fp = fingerprint ?? this.generateFingerprint();

    // 设置视口
    await context.setViewportSize(fp.viewport);

    // 设置用户代理（需要在创建 context 时设置，这里只是记录）
    logger.info(`应用指纹: UA=${fp.userAgent.split(' ')[0].split('/')[1]}, Viewport=${fp.viewport.width}x${fp.viewport.height}`);

    return;
  }

  /**
   * 在页面中注入反检测脚本
   */
  static async injectAntiDetectScripts(page: Page): Promise<void> {
    await page.addInitScript(WEBDRIVER_HIDE_SCRIPT);
    logger.info('注入反检测脚本');
  }

  /**
   * 在上下文中预先注入反检测脚本
   */
  static async setupAntiDetectContext(context: BrowserContext): Promise<void> {
    await context.addInitScript(WEBDRIVER_HIDE_SCRIPT);
    logger.info('设置反检测上下文');
  }

  // ==================== 完整初始化 ====================

  /**
   * 创建完整的反检测浏览器上下文
   */
  static async createStealthContext(
    browser: import('playwright').Browser,
    options?: {
      fingerprint?: FingerprintConfig;
      proxy?: { server: string; username?: string; password?: string };
    }
  ): Promise<BrowserContext> {
    const fingerprint = options?.fingerprint ?? this.generateFingerprint();

    const context = await browser.newContext({
      userAgent: fingerprint.userAgent,
      viewport: fingerprint.viewport,
      locale: fingerprint.locale,
      timezoneId: fingerprint.timezone,
      colorScheme: fingerprint.colorScheme,
      deviceScaleFactor: fingerprint.deviceScaleFactor,
      hasTouch: fingerprint.hasTouch,
      isMobile: fingerprint.isMobile,
      ignoreHTTPSErrors: true,
      proxy: options?.proxy,
    });

    // 注入反检测脚本
    await this.setupAntiDetectContext(context);

    logger.info('创建隐身浏览器上下文');
    return context;
  }

  // ==================== 行为模拟 ====================

  /**
   * 模拟完整的页面浏览行为
   */
  async simulatePageBrowsing(page: Page): Promise<void> {
    // 1. 随机鼠标移动
    const viewport = page.viewportSize() ?? { width: 1920, height: 1080 };
    const randomX = AntiDetect.randomDelay(100, viewport.width - 100);
    const randomY = AntiDetect.randomDelay(100, viewport.height - 100);

    const path = AntiDetect.generateMousePath(viewport.width / 2, viewport.height / 2, randomX, randomY);
    for (const point of path) {
      await page.mouse.move(point.x, point.y);
      await new Promise((resolve) => setTimeout(resolve, point.delay));
    }

    // 2. 简短浏览
    await this.browsePage(page, AntiDetect.randomDelay(1000, 3000));

    logger.debug('页面浏览行为模拟完成');
  }

  /**
   * 随机化点击时机
   */
  static randomizeClickTiming(): {
    preClickDelay: number;
    postClickDelay: number;
  } {
    return {
      preClickDelay: this.randomDelay(30, 150), // 反应时间
      postClickDelay: this.randomDelay(50, 200), // 点击后停顿
    };
  }
}

export default AntiDetect;