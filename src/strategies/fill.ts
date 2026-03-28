/**
 * 表单自动填充策略模块
 * 快速填写订单表单
 */

import { Page } from 'playwright';
import { AntiDetect } from '../engine/anti-detect.js';

export interface FormData {
  /** 输入框选择器 -> 值的映射 */
  fields: Record<string, string>;
  /** 下拉框选择器 -> 值的映射 */
  selects?: Record<string, string>;
  /** 复选框选择器 -> 是否选中的映射 */
  checkboxes?: Record<string, boolean>;
}

export interface FillOptions {
  /** 是否使用人类化打字 */
  humanTyping?: boolean;
  /** 打字速度（每字符延迟范围） */
  typingSpeed?: { min: number; max: number };
  /** 字段间延迟 */
  fieldDelay?: number;
  /** 填充前清空输入框 */
  clearBeforeFill?: boolean;
}

export class FillStrategy {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * 快速填充表单
   * 按顺序填充所有字段
   */
  async fillForm(data: FormData, options?: FillOptions): Promise<boolean> {
    const humanTyping = options?.humanTyping ?? true;
    const fieldDelay = options?.fieldDelay ?? 100;
    const clearBeforeFill = options?.clearBeforeFill ?? true;

    try {
      // 填充文本输入框
      for (const [selector, value] of Object.entries(data.fields)) {
        await this.fillInput(selector, value, {
          humanTyping,
          clearBeforeFill,
          typingSpeed: options?.typingSpeed,
        });

        // 字段间延迟
        if (humanTyping) {
          await AntiDetect.humanPause(fieldDelay, fieldDelay * 2);
        } else {
          await this.sleep(fieldDelay);
        }
      }

      // 填充下拉框
      if (data.selects) {
        for (const [selector, value] of Object.entries(data.selects)) {
          await this.selectOption(selector, value);
          await this.sleep(fieldDelay);
        }
      }

      // 设置复选框
      if (data.checkboxes) {
        for (const [selector, checked] of Object.entries(data.checkboxes)) {
          await this.setCheckbox(selector, checked);
          await this.sleep(fieldDelay);
        }
      }

      console.log('[FillStrategy] 表单填充完成');
      return true;
    } catch (error) {
      console.error('[FillStrategy] 表单填充失败:', error);
      return false;
    }
  }

  /**
   * 填充单个输入框
   */
  async fillInput(
    selector: string,
    value: string,
    options?: {
      humanTyping?: boolean;
      clearBeforeFill?: boolean;
      typingSpeed?: { min: number; max: number };
    }
  ): Promise<void> {
    const humanTyping = options?.humanTyping ?? true;

    // 等待输入框可见
    await this.page.waitForSelector(selector, { state: 'visible' });

    // 点击聚焦
    await this.page.click(selector);

    // 清空
    if (options?.clearBeforeFill ?? true) {
      await this.page.fill(selector, '');
    }

    if (humanTyping) {
      // 人类化打字
      await this.humanType(selector, value, options?.typingSpeed);
    } else {
      // 直接填充
      await this.page.fill(selector, value);
    }

    console.log(`[FillStrategy] 填充字段: ${selector} = ${value}`);
  }

  /**
   * 人类化打字
   * 模拟真实打字行为
   */
  private async humanType(
    selector: string,
    text: string,
    speed?: { min: number; max: number }
  ): Promise<void> {
    const minDelay = speed?.min ?? 50;
    const maxDelay = speed?.max ?? 150;

    for (const char of text) {
      await this.sleep(AntiDetect.randomDelay(minDelay, maxDelay));

      // 偶尔模拟打字错误（后退重打）
      if (Math.random() < 0.02 && text.length > 5) {
        await this.page.press(selector, 'Backspace');
        await this.sleep(AntiDetect.randomDelay(100, 300));
        await this.page.type(selector, char);
      } else {
        await this.page.type(selector, char);
      }
    }
  }

  /**
   * 选择下拉框选项
   */
  async selectOption(selector: string, value: string): Promise<void> {
    await this.page.waitForSelector(selector, { state: 'visible' });
    await this.page.selectOption(selector, value);
    console.log(`[FillStrategy] 选择选项: ${selector} = ${value}`);
  }

  /**
   * 设置复选框状态
   */
  async setCheckbox(selector: string, checked: boolean): Promise<void> {
    await this.page.waitForSelector(selector, { state: 'visible' });

    const currentChecked = await this.page.isChecked(selector);
    if (currentChecked !== checked) {
      await this.page.check(selector);
    }
    console.log(`[FillStrategy] 设置复选框: ${selector} = ${checked}`);
  }

  /**
   * 快速填充（无人类化模拟）
   * 用于抢票成功后快速填写信息
   */
  async quickFill(data: FormData): Promise<boolean> {
    return this.fillForm(data, {
      humanTyping: false,
      fieldDelay: 10,
      clearBeforeFill: true,
    });
  }

  /**
   * 预填充验证
   * 验证所有字段是否可以填充
   */
  async validateFields(data: FormData): Promise<{
    valid: boolean;
    missing: string[];
  }> {
    const missing: string[] = [];

    for (const selector of Object.keys(data.fields)) {
      const exists = await this.elementExists(selector);
      if (!exists) {
        missing.push(selector);
      }
    }

    if (data.selects) {
      for (const selector of Object.keys(data.selects)) {
        const exists = await this.elementExists(selector);
        if (!exists) {
          missing.push(selector);
        }
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  private async elementExists(selector: string): Promise<boolean> {
    try {
      const element = await this.page.$(selector);
      return element !== null;
    } catch {
      return false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default FillStrategy;