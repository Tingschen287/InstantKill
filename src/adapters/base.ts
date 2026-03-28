/**
 * 基础平台适配器模块
 * 提供抢票操作的基础抽象
 */

import { Page } from 'playwright';
import { BrowserEngine } from '../engine/browser.js';
import { PageMonitor } from '../engine/monitor.js';
import { RefreshStrategy } from '../strategies/refresh.js';
import { ClickStrategy } from '../strategies/click.js';
import { FillStrategy } from '../strategies/fill.js';
import { RetryManager } from '../engine/retry.js';

export interface AdapterConfig {
  /** 平台名称 */
  name: string;
  /** 目标 URL */
  targetUrl: string;
  /** 登录 URL（如果需要） */
  loginUrl?: string;
  /** 抢票开始时间 */
  startTime?: Date;
  /** 抢票按钮选择器 */
  buttonSelectors: string[];
  /** 表单数据（如果需要填写） */
  formData?: Record<string, string>;
  /** 成功检测条件 */
  successCondition?: (page: Page) => Promise<boolean>;
}

export abstract class BaseAdapter {
  protected browser: BrowserEngine;
  protected page!: Page;
  protected monitor!: PageMonitor;
  protected refresh!: RefreshStrategy;
  protected click!: ClickStrategy;
  protected fill!: FillStrategy;
  protected config: AdapterConfig;

  constructor(config: AdapterConfig) {
    this.config = config;
    this.browser = new BrowserEngine();
  }

  /**
   * 初始化适配器
   */
  async initialize(): Promise<void> {
    // 启动浏览器
    await this.browser.launch({ headless: false });

    // 创建页面
    this.page = await this.browser.newPage();

    // 初始化策略模块
    this.monitor = new PageMonitor(this.page);
    this.refresh = new RefreshStrategy(this.page);
    this.click = new ClickStrategy(this.page);
    this.fill = new FillStrategy(this.page);

    console.log(`[${this.config.name}] 适配器初始化完成`);
  }

  /**
   * 导航到目标页面
   */
  async navigateToTarget(): Promise<void> {
    await this.browser.navigate(this.config.targetUrl);
    console.log(`[${this.config.name}] 已导航到: ${this.config.targetUrl}`);
  }

  /**
   * 等待抢票开始
   */
  async waitForStart(): Promise<void> {
    if (!this.config.startTime) {
      console.log(`[${this.config.name}] 无设定开始时间，立即开始`);
      return;
    }

    const now = Date.now();
    const start = this.config.startTime.getTime();

    if (start > now) {
      const waitTime = start - now - 5000; // 提前5秒准备
      console.log(`[${this.config.name}] 等待 ${Math.ceil(waitTime / 1000)} 秒`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  /**
   * 开始抢票
   */
  async startGrab(): Promise<boolean> {
    console.log(`[${this.config.name}] 开始抢票`);

    // 预加载按钮元素
    for (const selector of this.config.buttonSelectors) {
      await this.click.preloadElement(selector);
    }

    // 精确刷新到开始时间
    if (this.config.startTime) {
      await this.refresh.refreshAtTargetTime(this.config.startTime, {
        提前刷新次数: 2,
      });
    }

    // 监听并点击
    const clicked = await this.click.watchAndClick(
      this.config.buttonSelectors.join(','),
      {
        pollInterval: 50,
        timeout: 60000,
      }
    );

    if (!clicked) {
      console.log(`[${this.config.name}] 点击失败，尝试重试`);
      return false;
    }

    // 检查是否成功
    if (this.config.successCondition) {
      const success = await this.config.successCondition(this.page);
      console.log(`[${this.config.name}] 抢票结果: ${success ? '成功' : '失败'}`);
      return success;
    }

    return true;
  }

  /**
   * 填写订单表单
   */
  async fillOrderForm(): Promise<boolean> {
    if (!this.config.formData) {
      return true;
    }

    console.log(`[${this.config.name}] 填写订单表单`);
    return this.fill.quickFill({
      fields: this.config.formData,
    });
  }

  /**
   * 完整抢票流程
   */
  async runFullProcess(): Promise<boolean> {
    const retryManager = new RetryManager({
      maxRetries: 3,
      initialDelay: 1000,
    });

    const result = await retryManager.execute(async () => {
      await this.initialize();
      await this.navigateToTarget();
      await this.waitForStart();
      const grabbed = await this.startGrab();

      if (grabbed) {
        await this.fillOrderForm();
      }

      return grabbed;
    }, '抢票流程');

    return result.success && result.result === true;
  }

  /**
   * 关闭浏览器
   */
  async cleanup(): Promise<void> {
    await this.browser.close();
    console.log(`[${this.config.name}] 适配器已关闭`);
  }
}

export default BaseAdapter;