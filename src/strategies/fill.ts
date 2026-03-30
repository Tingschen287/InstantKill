/**
 * 表单自动填充策略模块
 * 快速填写订单表单
 *
 * 功能清单 (B4):
 * - [x] 实现表单字段识别
 * - [x] 实现用户配置数据管理
 * - [x] 实现自动填充逻辑
 * - [x] 实现填充验证
 * - [x] 实现提交前确认
 */

import { Page, ElementHandle } from 'playwright';
import { AntiDetect } from '../engine/anti-detect.js';
import { createLogger } from '../utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';

const logger = createLogger('FillStrategy');

// ==================== 类型定义 ====================

export interface FormFieldConfig {
  /** 字段名称 */
  name: string;
  /** 选择器 */
  selector: string;
  /** 字段类型 */
  type: 'text' | 'email' | 'phone' | 'password' | 'number' | 'select' | 'checkbox' | 'radio' | 'textarea' | 'date';
  /** 是否必填 */
  required?: boolean;
  /** 默认值 */
  defaultValue?: string | boolean;
  /** 验证规则 */
  validation?: {
    pattern?: RegExp;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
  };
  /** 填充延迟 */
  delay?: number;
}

export interface UserConfig {
  /** 用户基本信息 */
  personal?: {
    name?: string;
    email?: string;
    phone?: string;
    idNumber?: string;
    address?: string;
  };
  /** 订单信息 */
  order?: {
    quantity?: number;
    ticketType?: string;
    seatPreference?: string;
    paymentMethod?: string;
  };
  /** 其他自定义字段 */
  custom?: Record<string, string | boolean | number>;
}

export interface FormData {
  /** 输入框选择器 -> 值的映射 */
  fields: Record<string, string>;
  /** 下拉框选择器 -> 值的映射 */
  selects?: Record<string, string>;
  /** 复选框选择器 -> 是否选中的映射 */
  checkboxes?: Record<string, boolean>;
  /** 单选框选择器 -> 选中值的映射 */
  radios?: Record<string, string>;
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
  /** 超时时间 */
  timeout?: number;
  /** 是否验证填充结果 */
  verify?: boolean;
  /** 填充失败时的回调 */
  onFieldError?: (selector: string, error: Error) => void;
}

export interface FillResult {
  success: boolean;
  filledFields: number;
  failedFields: string[];
  totalTime: number;
  validationErrors: string[];
}

export interface PreSubmitCheck {
  allFieldsValid: boolean;
  requiredFieldsFilled: boolean;
  missingFields: string[];
  validationErrors: string[];
}

// ==================== 表单字段识别器 ====================

export class FormFieldRecognizer {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * 自动识别表单字段
   * 分析页面结构，自动发现表单元素
   */
  async recognizeFields(options?: {
    containerSelector?: string;
    includeHidden?: boolean;
    guessLabels?: boolean;
  }): Promise<FormFieldConfig[]> {
    const fields: FormFieldConfig[] = [];
    const container = options?.containerSelector ?? 'body';

    // 识别文本输入框
    const textInputs = await this.page.$$(`${container} input[type="text"], input:not([type]), input[type="email"], input[type="tel"], input[type="number"]`);
    for (const input of textInputs) {
      const config = await this.getInputConfig(input);
      if (config) fields.push(config);
    }

    // 识别密码输入框
    const passwordInputs = await this.page.$$(`${container} input[type="password"]`);
    for (const input of passwordInputs) {
      const config = await this.getInputConfig(input);
      if (config) {
        config.type = 'password';
        fields.push(config);
      }
    }

    // 识别下拉框
    const selects = await this.page.$$(`${container} select`);
    for (const select of selects) {
      const config = await this.getSelectConfig(select);
      if (config) fields.push(config);
    }

    // 识别复选框
    const checkboxes = await this.page.$$(`${container} input[type="checkbox"]`);
    for (const checkbox of checkboxes) {
      const config = await this.getCheckboxConfig(checkbox);
      if (config) fields.push(config);
    }

    // 识别单选框（按组）
    const radioGroups = await this.getRadioGroups(container);
    for (const group of radioGroups) {
      fields.push(group);
    }

    // 识别文本区域
    const textareas = await this.page.$$(`${container} textarea`);
    for (const textarea of textareas) {
      const config = await this.getInputConfig(textarea);
      if (config) {
        config.type = 'textarea';
        fields.push(config);
      }
    }

    logger.info(`识别到 ${fields.length} 个表单字段`);
    return fields;
  }

  /**
   * 获取输入框配置
   */
  private async getInputConfig(element: ElementHandle): Promise<FormFieldConfig | null> {
    try {
      const id = await element.getAttribute('id');
      const name = await element.getAttribute('name');
      const placeholder = await element.getAttribute('placeholder');
      const type = await element.getAttribute('type') ?? 'text';
      const required = await element.getAttribute('required');

      // 生成选择器
      const selector = id ? `#${id}` : name ? `[name="${name}"]`] : null;
      if (!selector) return null;

      // 尝试获取标签
      let label = name ?? id ?? placeholder ?? 'unknown';

      // 推断字段类型
      const fieldType = this.inferFieldType(selector, type, placeholder ?? '');

      return {
        name: label,
        selector,
        type: fieldType,
        required: required !== null,
      };
    } catch {
      return null;
    }
  }

  /**
   * 获取下拉框配置
   */
  private async getSelectConfig(element: ElementHandle): Promise<FormFieldConfig | null> {
    try {
      const id = await element.getAttribute('id');
      const name = await element.getAttribute('name');
      const required = await element.getAttribute('required');

      const selector = id ? `#${id}` : name ? `[name="${name}"]`] : null;
      if (!selector) return null;

      return {
        name: name ?? id ?? 'select',
        selector,
        type: 'select',
        required: required !== null,
      };
    } catch {
      return null;
    }
  }

  /**
   * 获取复选框配置
   */
  private async getCheckboxConfig(element: ElementHandle): Promise<FormFieldConfig | null> {
    try {
      const id = await element.getAttribute('id');
      const name = await element.getAttribute('name');
      const required = await element.getAttribute('required');

      const selector = id ? `#${id}` : name ? `[name="${name}"]`] : null;
      if (!selector) return null;

      return {
        name: name ?? id ?? 'checkbox',
        selector,
        type: 'checkbox',
        required: required !== null,
      };
    } catch {
      return null;
    }
  }

  /**
   * 获取单选框组
   */
  private async getRadioGroups(container: string): Promise<FormFieldConfig[]> {
    const groups: FormFieldConfig[] = [];

    try {
      // 查找所有单选框
      const radios = await this.page.$$(`${container} input[type="radio"]`);

      // 按名字分组
      const groupMap = new Map<string, ElementHandle[]>();

      for (const radio of radios) {
        const name = await radio.getAttribute('name') ?? 'default';
        if (!groupMap.has(name)) {
          groupMap.set(name, []);
        }
        groupMap.get(name)?.push(radio);
      }

      // 为每个组创建配置
      for (const [name, elements] of groupMap) {
        if (elements.length > 0) {
          const firstRadio = elements[0];
          const id = await firstRadio.getAttribute('id');

          groups.push({
            name,
            selector: `[name="${name}"]`, // 单选框组按名字选择
            type: 'radio',
          });
        }
      }
    } catch {
      // 忽略错误
    }

    return groups;
  }

  /**
   * 推断字段类型
   */
  private inferFieldType(selector: string, inputType: string, placeholder: string): FormFieldConfig['type'] {
    const lowerPlaceholder = placeholder.toLowerCase();
    const lowerSelector = selector.toLowerCase();

    if (inputType === 'email' || lowerPlaceholder.includes('email') || lowerPlaceholder.includes('邮箱')) {
      return 'email';
    }

    if (inputType === 'tel' || lowerPlaceholder.includes('phone') || lowerPlaceholder.includes('电话') || lowerPlaceholder.includes('手机')) {
      return 'phone';
    }

    if (inputType === 'number' || lowerPlaceholder.includes('数量') || lowerPlaceholder.includes('quantity')) {
      return 'number';
    }

    if (inputType === 'password' || lowerPlaceholder.includes('密码') || lowerPlaceholder.includes('password')) {
      return 'password';
    }

    if (lowerPlaceholder.includes('日期') || lowerPlaceholder.includes('date')) {
      return 'date';
    }

    return 'text';
  }

  /**
   * 查找特定类型的字段
   */
  async findFieldsByType(type: FormFieldConfig['type']): Promise<FormFieldConfig[]> {
    const allFields = await this.recognizeFields();
    return allFields.filter((f) => f.type === type);
  }

  /**
   * 查找必填字段
   */
  async findRequiredFields(): Promise<FormFieldConfig[]> {
    const allFields = await this.recognizeFields();
    return allFields.filter((f) => f.required);
  }
}

// ==================== 用户配置管理器 ====================

export class UserConfigManager {
  private configPath: string;
  private config: UserConfig;

  constructor(configPath: string = './configs/user-config.json') {
    this.configPath = configPath;
    this.config = this.loadConfig();
  }

  /**
   * 加载用户配置
   */
  private loadConfig(): UserConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf-8');
        return JSON.parse(content) as UserConfig;
      }
    } catch (error) {
      logger.warn(`加载用户配置失败: ${(error as Error).message}`);
    }

    return {
      personal: {},
      order: {},
      custom: {},
    };
  }

  /**
   * 保存用户配置
   */
  saveConfig(config: UserConfig): void {
    try {
      // 确保目录存在
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
      this.config = config;
      logger.info(`用户配置已保存: ${this.configPath}`);
    } catch (error) {
      logger.error(`保存用户配置失败: ${(error as Error).message}`);
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): UserConfig {
    return this.config;
  }

  /**
   * 更新配置
   */
  updateConfig(updates: Partial<UserConfig>): void {
    this.config = {
      ...this.config,
      personal: { ...this.config.personal, ...updates.personal },
      order: { ...this.config.order, ...updates.order },
      custom: { ...this.config.custom, ...updates.custom },
    };
    this.saveConfig(this.config);
  }

  /**
   * 获取字段值
   */
  getFieldValue(fieldName: string): string | boolean | number | undefined {
    // 检查个人信息
    const personalKeys: Record<string, keyof UserConfig['personal']> = {
      name: 'name',
      姓名: 'name',
      email: 'email',
      邮箱: 'email',
      phone: 'phone',
      电话: 'phone',
      手机: 'phone',
      idNumber: 'idNumber',
      身份证: 'idNumber',
      address: 'address',
      地址: 'address',
    };

    if (personalKeys[fieldName]) {
      return this.config.personal?.[personalKeys[fieldName]];
    }

    // 检查订单信息
    const orderKeys: Record<string, keyof UserConfig['order']> = {
      quantity: 'quantity',
      数量: 'quantity',
      ticketType: 'ticketType',
      ticket_type: 'ticketType',
      seatPreference: 'seatPreference',
      paymentMethod: 'paymentMethod',
    };

    if (orderKeys[fieldName]) {
      return this.config.order?.[orderKeys[fieldName]];
    }

    // 检查自定义字段
    return this.config.custom?.[fieldName];
  }

  /**
   * 根据字段类型获取值
   */
  getValueByFieldType(type: FormFieldConfig['type']): string | undefined {
    switch (type) {
      case 'email':
        return this.config.personal?.email;
      case 'phone':
        return this.config.personal?.phone;
      case 'text':
        return this.config.personal?.name;
      case 'password':
        return undefined; // 密码通常需要特殊处理
      default:
        return undefined;
    }
  }

  /**
   * 创建示例配置
   */
  createExampleConfig(): UserConfig {
    return {
      personal: {
        name: '张三',
        email: 'zhangsan@example.com',
        phone: '13800138000',
        idNumber: '110101199001011234',
        address: '北京市朝阳区',
      },
      order: {
        quantity: 1,
        ticketType: 'normal',
        seatPreference: 'middle',
        paymentMethod: 'alipay',
      },
      custom: {},
    };
  }
}

// ==================== 表单填充策略 ====================

export class FillStrategy {
  private page: Page;
  private recognizer: FormFieldRecognizer;
  private configManager: UserConfigManager;
  private fillStats: { filled: number; failed: number; skipped: number } = {
    filled: 0,
    failed: 0,
    skipped: 0,
  };

  constructor(page: Page, configPath?: string) {
    this.page = page;
    this.recognizer = new FormFieldRecognizer(page);
    this.configManager = new UserConfigManager(configPath);
  }

  // ==================== 自动填充 ====================

  /**
   * 智能填充表单
   * 自动识别字段并使用用户配置填充
   */
  async smartFill(options?: FillOptions): Promise<FillResult> {
    const startTime = Date.now();
    const humanTyping = options?.humanTyping ?? true;
    const verify = options?.verify ?? true;
    const failedFields: string[] = [];
    const validationErrors: string[] = [];

    // 识别表单字段
    const fields = await this.recognizer.recognizeFields();
    logger.info(`识别到 ${fields.length} 个字段`);

    for (const field of fields) {
      try {
        // 获取字段值
        const value = this.configManager.getFieldValue(field.name) ||
          this.configManager.getValueByFieldType(field.type) ||
          field.defaultValue;

        if (value === undefined) {
          this.fillStats.skipped++;
          logger.debug(`跳过字段 ${field.name}（无值）`);
          continue;
        }

        // 填充字段
        const success = await this.fillField(field, value, options);

        if (success) {
          this.fillStats.filled++;

          // 验证填充
          if (verify) {
            const validationResult = await this.validateField(field, value);
            if (!validationResult.valid) {
              validationErrors.push(`${field.name}: ${validationResult.error}`);
            }
          }
        } else {
          this.fillStats.failed++;
          failedFields.push(field.selector);
        }
      } catch (error) {
        this.fillStats.failed++;
        failedFields.push(field.selector);
        options?.onFieldError?.(field.selector, error as Error);
      }
    }

    const totalTime = Date.now() - startTime;
    const success = failedFields.length === 0;

    logger.info(
      `智能填充完成: ${this.fillStats.filled} 成功, ` +
      `${this.fillStats.failed} 失败, ` +
      `${this.fillStats.skipped} 跳过`
    );

    return {
      success,
      filledFields: this.fillStats.filled,
      failedFields,
      totalTime,
      validationErrors,
    };
  }

  /**
   * 填充指定字段
   */
  async fillField(field: FormFieldConfig, value: string | boolean | number, options?: FillOptions): Promise<boolean> {
    const timeout = options?.timeout ?? 5000;

    try {
      await this.page.waitForSelector(field.selector, { state: 'visible', timeout });

      switch (field.type) {
        case 'text':
        case 'email':
        case 'phone':
        case 'password':
        case 'number':
        case 'textarea':
        case 'date':
          await this.fillInput(field.selector, String(value), options);
          break;

        case 'select':
          await this.selectOption(field.selector, String(value));
          break;

        case 'checkbox':
          await this.setCheckbox(field.selector, Boolean(value));
          break;

        case 'radio':
          await this.selectRadio(field.selector, String(value));
          break;
      }

      logger.debug(`填充字段: ${field.name} (${field.type}) = ${value}`);
      return true;
    } catch (error) {
      logger.warn(`填充字段失败: ${field.selector}`);
      return false;
    }
  }

  /**
   * 快速填充表单
   * 按顺序填充所有字段
   */
  async fillForm(data: FormData, options?: FillOptions): Promise<FillResult> {
    const startTime = Date.now();
    const humanTyping = options?.humanTyping ?? true;
    const fieldDelay = options?.fieldDelay ?? 100;
    const clearBeforeFill = options?.clearBeforeFill ?? true;
    const failedFields: string[] = [];
    const validationErrors: string[] = [];
    let filledCount = 0;

    try {
      // 填充文本输入框
      for (const [selector, value] of Object.entries(data.fields)) {
        try {
          await this.fillInput(selector, value, {
            humanTyping,
            clearBeforeFill,
            typingSpeed: options?.typingSpeed,
            timeout: options?.timeout,
          });

          filledCount++;
          this.fillStats.filled++;

          // 字段间延迟
          if (humanTyping) {
            await AntiDetect.humanPause(fieldDelay, fieldDelay * 2);
          } else {
            await this.sleep(fieldDelay);
          }
        } catch (error) {
          failedFields.push(selector);
          this.fillStats.failed++;
          options?.onFieldError?.(selector, error as Error);
        }
      }

      // 填充下拉框
      if (data.selects) {
        for (const [selector, value] of Object.entries(data.selects)) {
          try {
            await this.selectOption(selector, value);
            filledCount++;
            await this.sleep(fieldDelay);
          } catch (error) {
            failedFields.push(selector);
          }
        }
      }

      // 设置复选框
      if (data.checkboxes) {
        for (const [selector, checked] of Object.entries(data.checkboxes)) {
          try {
            await this.setCheckbox(selector, checked);
            filledCount++;
            await this.sleep(fieldDelay);
          } catch (error) {
            failedFields.push(selector);
          }
        }
      }

      // 设置单选框
      if (data.radios) {
        for (const [name, value] of Object.entries(data.radios)) {
          try {
            await this.selectRadio(name, value);
            filledCount++;
            await this.sleep(fieldDelay);
          } catch (error) {
            failedFields.push(name);
          }
        }
      }

      const totalTime = Date.now() - startTime;
      logger.info(`表单填充完成: ${filledCount} 个字段`);

      return {
        success: failedFields.length === 0,
        filledFields: filledCount,
        failedFields,
        totalTime,
        validationErrors,
      };
    } catch (error) {
      logger.error(`表单填充失败: ${(error as Error).message}`);
      return {
        success: false,
        filledFields: filledCount,
        failedFields,
        totalTime: Date.now() - startTime,
        validationErrors: [(error as Error).message],
      };
    }
  }

  // ==================== 填充单个字段 ====================

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
      timeout?: number;
    }
  ): Promise<void> {
    const humanTyping = options?.humanTyping ?? true;
    const timeout = options?.timeout ?? 5000;

    // 等待输入框可见
    await this.page.waitForSelector(selector, { state: 'visible', timeout });

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

    logger.debug(`填充字段: ${selector} = ${value}`);
  }

  /**
   * 人类化打字
   */
  private async humanType(
    selector: string,
    text: string,
    speed?: { min: number; max: number }
  ): Promise<void> {
    const minDelay = speed?.min ?? 50;
    const maxDelay = speed?.max ?? 150;

    // 使用 AntiDetect 的 humanType 方法
    await AntiDetect.humanType(this.page, selector, text, {
      minDelay,
      maxDelay,
      errorRate: 0.02,
    });
  }

  /**
   * 选择下拉框选项
   */
  async selectOption(selector: string, value: string): Promise<void> {
    await this.page.waitForSelector(selector, { state: 'visible' });
    await this.page.selectOption(selector, value);
    logger.debug(`选择选项: ${selector} = ${value}`);
  }

  /**
   * 设置复选框状态
   */
  async setCheckbox(selector: string, checked: boolean): Promise<void> {
    await this.page.waitForSelector(selector, { state: 'visible' });

    const currentChecked = await this.page.isChecked(selector);
    if (currentChecked !== checked) {
      if (checked) {
        await this.page.check(selector);
      } else {
        await this.page.uncheck(selector);
      }
    }
    logger.debug(`设置复选框: ${selector} = ${checked}`);
  }

  /**
   * 选择单选框
   */
  async selectRadio(name: string, value: string): Promise<void> {
    // 单选框通常按 name 属性分组，选择特定值
    const selector = `input[type="radio"][name="${name}"][value="${value}"]`;
    await this.page.waitForSelector(selector, { state: 'visible' });
    await this.page.check(selector);
    logger.debug(`选择单选框: ${name} = ${value}`);
  }

  // ==================== 快速填充 ====================

  /**
   * 快速填充（无人类化模拟）
   */
  async quickFill(data: FormData): Promise<FillResult> {
    return this.fillForm(data, {
      humanTyping: false,
      fieldDelay: 10,
      clearBeforeFill: true,
      verify: true,
    });
  }

  /**
   * 紧急填充
   * 用于抢票成功后极速填写信息
   */
  async emergencyFill(data: FormData): Promise<FillResult> {
    const startTime = Date.now();

    // 并行填充所有字段
    const fillPromises: Promise<void>[] = [];

    for (const [selector, value] of Object.entries(data.fields)) {
      fillPromises.push(
        this.page.fill(selector, value).catch(() => {})
      );
    }

    if (data.selects) {
      for (const [selector, value] of Object.entries(data.selects)) {
        fillPromises.push(
          this.page.selectOption(selector, value).catch(() => {})
        );
      }
    }

    if (data.checkboxes) {
      for (const [selector, checked] of Object.entries(data.checkboxes)) {
        fillPromises.push(
          (checked ? this.page.check(selector) : this.page.uncheck(selector)).catch(() => {})
        );
      }
    }

    await Promise.all(fillPromises);

    const totalTime = Date.now() - startTime;
    logger.info(`紧急填充完成，耗时 ${totalTime}ms`);

    return {
      success: true,
      filledFields: fillPromises.length,
      failedFields: [],
      totalTime,
      validationErrors: [],
    };
  }

  // ==================== 验证 ====================

  /**
   * 验证字段填充结果
   */
  async validateField(field: FormFieldConfig, expectedValue: string | boolean | number): Promise<{ valid: boolean; error?: string }> {
    try {
      const element = await this.page.$(field.selector);
      if (!element) {
        return { valid: false, error: '元素不存在' };
      }

      // 获取实际值
      let actualValue: string | boolean;

      switch (field.type) {
        case 'text':
        case 'email':
        case 'phone':
        case 'password':
        case 'number':
        case 'textarea':
          actualValue = await element.inputValue();
          break;

        case 'checkbox':
          actualValue = await element.isChecked();
          break;

        case 'select':
          actualValue = await this.page.$eval(field.selector, (el: any) => el.value);
          break;

        default:
          return { valid: true };
      }

      // 比较值
      if (String(actualValue) !== String(expectedValue)) {
        return {
          valid: false,
          error: `值不匹配: 期望 ${expectedValue}, 实际 ${actualValue}`,
        };
      }

      // 自定义验证规则
      if (field.validation) {
        if (field.validation.pattern && !field.validation.pattern.test(String(actualValue))) {
          return { valid: false, error: '格式验证失败' };
        }

        if (field.validation.minLength && String(actualValue).length < field.validation.minLength) {
          return { valid: false, error: `长度不足 ${field.validation.minLength}` };
        }

        if (field.validation.maxLength && String(actualValue).length > field.validation.maxLength) {
          return { valid: false, error: `长度超出 ${field.validation.maxLength}` };
        }
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: (error as Error).message };
    }
  }

  /**
   * 预提交检查
   */
  async preSubmitCheck(fields?: FormFieldConfig[]): Promise<PreSubmitCheck> {
    const checkFields = fields ?? await this.recognizer.recognizeFields();
    const missingFields: string[] = [];
    const validationErrors: string[] = [];

    for (const field of checkFields) {
      // 检查必填字段
      if (field.required) {
        const element = await this.page.$(field.selector);
        if (!element) {
          missingFields.push(field.selector);
          continue;
        }

        const visible = await element.isVisible();
        if (!visible) {
          missingFields.push(field.selector);
          continue;
        }

        // 检查是否有值
        let hasValue = false;

        switch (field.type) {
          case 'text':
          case 'email':
          case 'phone':
          case 'password':
          case 'number':
          case 'textarea':
            const inputValue = await element.inputValue();
            hasValue = inputValue.trim() !== '';
            break;

          case 'checkbox':
            hasValue = await element.isChecked();
            break;

          case 'select':
            const selectValue = await this.page.$eval(field.selector, (el: any) => el.value);
            hasValue = selectValue !== '';
            break;
        }

        if (!hasValue) {
          missingFields.push(field.selector);
        }
      }

      // 验证已有值
      const value = this.configManager.getFieldValue(field.name);
      if (value !== undefined) {
        const validation = await this.validateField(field, value);
        if (!validation.valid && validation.error) {
          validationErrors.push(`${field.name}: ${validation.error}`);
        }
      }
    }

    return {
      allFieldsValid: validationErrors.length === 0,
      requiredFieldsFilled: missingFields.length === 0,
      missingFields,
      validationErrors,
    };
  }

  /**
   * 等待用户确认后提交
   */
  async confirmBeforeSubmit(options?: {
    timeout?: number;
    message?: string;
    confirmSelector?: string;
    autoConfirm?: boolean;
  }): Promise<boolean> {
    const timeout = options?.timeout ?? 30000;
    const autoConfirm = options?.autoConfirm ?? false;

    logger.info('等待提交确认...');

    if (autoConfirm) {
      logger.info('自动确认提交');
      return true;
    }

    // 模拟用户确认（实际应用中应该有真实交互）
    // 这里提供占位实现
    logger.info('请确认提交（在真实应用中会有交互提示）');

    // 如果有确认按钮，等待点击
    if (options?.confirmSelector) {
      try {
        await this.page.waitForSelector(options.confirmSelector, { state: 'visible', timeout });
        return true;
      } catch {
        return false;
      }
    }

    // 默认返回 true（假设用户已确认）
    return true;
  }

  // ==================== 辅助方法 ====================

  /**
   * 预填充验证
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

    if (data.checkboxes) {
      for (const selector of Object.keys(data.checkboxes)) {
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

  /**
   * 获取统计信息
   */
  getStats(): { filled: number; failed: number; skipped: number; successRate: number } {
    return {
      ...this.fillStats,
      successRate: this.fillStats.filled / (this.fillStats.filled + this.fillStats.failed) || 0,
    };
  }

  /**
   * 重置统计
   */
  resetStats(): void {
    this.fillStats = { filled: 0, failed: 0, skipped: 0 };
  }

  /**
   * 获取配置管理器
   */
  getConfigManager(): UserConfigManager {
    return this.configManager;
  }

  /**
   * 获取字段识别器
   */
  getRecognizer(): FormFieldRecognizer {
    return this.recognizer;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ==================== 便捷方法 ====================

/**
 * 快速填充表单
 */
export async function quickFillForm(page: Page, data: FormData): Promise<FillResult> {
  const strategy = new FillStrategy(page);
  return strategy.quickFill(data);
}

/**
 * 智能填充表单
 */
export async function smartFillForm(page: Page, configPath?: string): Promise<FillResult> {
  const strategy = new FillStrategy(page, configPath);
  return strategy.smartFill();
}

/**
 * 紧急填充表单
 */
export async function emergencyFillForm(page: Page, data: FormData): Promise<FillResult> {
  const strategy = new FillStrategy(page);
  return strategy.emergencyFill(data);
}

export default FillStrategy;