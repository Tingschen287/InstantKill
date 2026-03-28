/**
 * 配置驱动的平台适配器
 * 基于配置文件的通用抢票模板
 */

import { Page } from 'playwright';
import { BaseAdapter, AdapterConfig } from './base.js';

export interface ConfigDrivenConfig extends AdapterConfig {
  /** 预抢检查选择器 */
  preCheckSelector?: string;
  /** 预抢检查值 */
  preCheckValue?: string;
  /** 失败检测选择器 */
  failureSelector?: string;
  /** 失败提示文本 */
  failureText?: string;
  /** 成功页面 URL 模式 */
  successUrlPattern?: string;
  /** 页面加载等待选择器 */
  pageLoadSelector?: string;
  /** 刷新策略配置 */
  refreshConfig?: {
    interval?: number;
    maxRefreshes?: number;
  };
}

export class ConfigAdapter extends BaseAdapter {
  private configDriven: ConfigDrivenConfig;

  constructor(config: ConfigDrivenConfig) {
    super(config);
    this.configDriven = config;
  }

  /**
   * 等待页面加载完成
   */
  async waitForPageLoad(): Promise<void> {
    if (this.configDriven.pageLoadSelector) {
      await this.page.waitForSelector(this.configDriven.pageLoadSelector, {
        state: 'visible',
      });
    } else {
      await this.page.waitForLoadState('domcontentloaded');
    }
  }

  /**
   * 预检查（验证是否可以抢）
   */
  async preCheck(): Promise<boolean> {
    if (!this.configDriven.preCheckSelector) {
      return true;
    }

    try {
      const element = await this.page.$(this.configDriven.preCheckSelector);
      if (!element) return false;

      const text = await element.textContent();
      const expected = this.configDriven.preCheckValue;

      return text?.includes(expected ?? '') ?? false;
    } catch {
      return false;
    }
  }

  /**
   * 检测是否失败
   */
  async checkFailure(): Promise<boolean> {
    if (!this.configDriven.failureSelector) {
      return false;
    }

    try {
      const element = await this.page.$(this.configDriven.failureSelector);
      if (!element) return false;

      if (this.configDriven.failureText) {
        const text = await element.textContent();
        return text?.includes(this.configDriven.failureText) ?? false;
      }

      return element.isVisible();
    } catch {
      return false;
    }
  }

  /**
   * 检测是否成功（基于 URL）
   */
  async checkSuccessByUrl(): Promise<boolean> {
    if (!this.configDriven.successUrlPattern) {
      return false;
    }

    const url = this.page.url();
    return url.includes(this.configDriven.successUrlPattern);
  }

  /**
   * 增强的抢票流程
   */
  async enhancedGrab(): Promise<boolean> {
    console.log(`[${this.config.name}] 增强抢票流程开始`);

    // 预检查
    const canGrab = await this.preCheck();
    if (!canGrab) {
      console.log(`[${this.config.name}] 预检查失败，等待条件满足`);
      await this.waitForPreCheck();
    }

    // 执行基础抢票流程
    const result = await this.startGrab();

    if (!result) {
      // 检查失败原因
      const failed = await this.checkFailure();
      if (failed) {
        console.log(`[${this.config.name}] 检测到失败提示`);
      }
      return false;
    }

    // 检查是否成功（URL 或自定义条件）
    const successByUrl = await this.checkSuccessByUrl();
    const successByCondition = this.config.successCondition
      ? await this.config.successCondition(this.page)
      : true;

    return successByUrl || successByCondition;
  }

  /**
   * 等待预检查条件满足
   */
  private async waitForPreCheck(): Promise<void> {
    const maxWait = 60000;
    const interval = this.configDriven.refreshConfig?.interval ?? 1000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      if (await this.preCheck()) {
        console.log(`[${this.config.name}] 预检查条件已满足`);
        return;
      }

      await this.page.reload({ waitUntil: 'domcontentloaded' });
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new Error('预检查等待超时');
  }

  /**
   * 完整配置驱动流程
   */
  async runConfigDrivenProcess(): Promise<boolean> {
    await this.initialize();
    await this.navigateToTarget();
    await this.waitForPageLoad();
    await this.waitForStart();

    const result = await this.enhancedGrab();

    if (result) {
      await this.fillOrderForm();
    }

    return result;
  }

  /**
   * 创建成功检测条件
   */
  static createSuccessCondition(
    successSelectors: string[]
  ): (page: Page) => Promise<boolean> {
    return async (page: Page) => {
      for (const selector of successSelectors) {
        try {
          const element = await page.$(selector);
          if (element && await element.isVisible()) {
            return true;
          }
        } catch {
          // 继续检查下一个
        }
      }
      return false;
    };
  }
}

export default ConfigAdapter;