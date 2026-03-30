/**
 * 配置驱动的平台适配器
 * 基于配置文件的通用抢票模板
 *
 * 功能清单:
 * C2 - 自定义脚本:
 * - [x] 设计脚本 API 接口
 * - [x] 实现脚本加载和执行
 * - [x] 实现脚本沙箱隔离
 * - [x] 实现脚本参数传递
 * - [x] 实现脚本错误处理
 */

import { Page, Browser } from 'playwright';
import { BaseAdapter, AdapterConfig, WorkflowStep, ConfigLoader, ConfigFile, PlatformConfig } from './base.js';
import { createLogger } from '../utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

const logger = createLogger('ConfigAdapter');

// ==================== 类型定义 ====================

export interface ScriptContext {
  /** 页面对象 */
  page: Page;
  /** 浏览器对象 */
  browser: Browser;
  /** 日志函数 */
  log: (message: string) => void;
  /** 等待函数 */
  sleep: (ms: number) => Promise<void>;
  /** 配置数据 */
  config: Record<string, any>;
  /** 用户数据 */
  userData: Record<string, any>;
  /** 工具函数 */
  utils: {
    click: (selector: string) => Promise<boolean>;
    fill: (selector: string, value: string) => Promise<boolean>;
    wait: (selector: string, timeout?: number) => Promise<boolean>;
    getText: (selector: string) => Promise<string | null>;
    exists: (selector: string) => Promise<boolean>;
    evaluate: (fn: () => any) => Promise<any>;
    screenshot: (name?: string) => Promise<string>;
  };
}

export interface ScriptConfig {
  /** 脚本路径 */
  path: string;
  /** 脚本类型 */
  type: 'file' | 'inline' | 'module';
  /** 脚本内容（内联脚本） */
  content?: string;
  /** 脚本参数 */
  params?: Record<string, any>;
  /** 超时时间 */
  timeout?: number;
  /** 是否启用沙箱 */
  sandbox?: boolean;
}

export interface ScriptResult {
  success: boolean;
  result?: any;
  error?: string;
  duration: number;
  logs: string[];
}

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
  /** 自定义脚本配置 */
  scripts?: {
    beforeStart?: ScriptConfig;
    afterClick?: ScriptConfig;
    beforeFill?: ScriptConfig;
    afterFill?: ScriptConfig;
    onError?: ScriptConfig;
    custom?: Record<string, ScriptConfig>;
  };
}

// ==================== 脚本执行器 ====================

export class ScriptExecutor {
  private context: ScriptContext;
  private logs: string[] = [];

  constructor(context: ScriptContext) {
    this.context = context;
  }

  /**
   * 执行脚本文件
   */
  async executeFile(scriptPath: string, params?: Record<string, any>, timeout?: number): Promise<ScriptResult> {
    const startTime = Date.now();
    this.logs = [];

    try {
      if (!fs.existsSync(scriptPath)) {
        throw new Error(`脚本文件不存在: ${scriptPath}`);
      }

      const content = fs.readFileSync(scriptPath, 'utf-8');
      return await this.execute(content, params, timeout);
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        duration: Date.now() - startTime,
        logs: this.logs,
      };
    }
  }

  /**
   * 执行脚本内容
   */
  async execute(scriptContent: string, params?: Record<string, any>, timeout?: number): Promise<ScriptResult> {
    const startTime = Date.now();
    this.logs = [];

    try {
      // 创建沙箱上下文
      const sandbox = this.createSandbox(params);

      // 包装脚本为异步函数
      const wrappedScript = `
        (async () => {
          ${scriptContent}
        })()
      `;

      // 设置超时
      const timeoutMs = timeout ?? 30000;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`脚本执行超时: ${timeoutMs}ms`)), timeoutMs);
      });

      // 执行脚本
      const result = await Promise.race([
        vm.runInNewContext(wrappedScript, sandbox),
        timeoutPromise,
      ]);

      return {
        success: true,
        result,
        duration: Date.now() - startTime,
        logs: this.logs,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        duration: Date.now() - startTime,
        logs: this.logs,
      };
    }
  }

  /**
   * 创建沙箱上下文
   */
  private createSandbox(params?: Record<string, any>): vm.Context {
    const self = this;

    return vm.createContext({
      // 页面对象（受限访问）
      page: this.context.page,

      // 日志函数
      log: (message: string) => {
        self.logs.push(`[${new Date().toISOString()}] ${message}`);
        self.context.log(message);
      },

      // 等待函数
      sleep: this.context.sleep,

      // 配置和用户数据
      config: { ...this.context.config, ...params },
      userData: this.context.userData,

      // 工具函数
      utils: this.context.utils,

      // 全局对象
      console: {
        log: (msg: string) => self.logs.push(msg),
        error: (msg: string) => self.logs.push(`ERROR: ${msg}`),
        warn: (msg: string) => self.logs.push(`WARN: ${msg}`),
      },

      // 标准库（受限）
      JSON,
      Math,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,

      // 禁止访问的全局对象
      require: undefined,
      import: undefined,
      process: undefined,
      global: undefined,
      module: undefined,
      exports: undefined,
      __dirname: undefined,
      __filename: undefined,
    });
  }

  /**
   * 获取日志
   */
  getLogs(): string[] {
    return this.logs;
  }
}

// ==================== 配置驱动适配器 ====================

export class ConfigAdapter extends BaseAdapter {
  private configDriven: ConfigDrivenConfig;
  private scriptExecutor!: ScriptExecutor;
  private configLoader: ConfigLoader | null = null;

  constructor(config: ConfigDrivenConfig) {
    super(config);
    this.configDriven = config;
  }

  /**
   * 初始化适配器
   */
  async initialize(): Promise<void> {
    await super.initialize();

    // 初始化脚本执行器
    this.scriptExecutor = new ScriptExecutor({
      page: this.page,
      browser: await this.page.context().browser()!,
      log: (msg) => logger.info(`[Script] ${msg}`),
      sleep: (ms) => this.sleep(ms),
      config: this.configDriven,
      userData: {},
      utils: {
        click: async (selector) => {
          try {
            await this.page.click(selector);
            return true;
          } catch {
            return false;
          }
        },
        fill: async (selector, value) => {
          try {
            await this.page.fill(selector, value);
            return true;
          } catch {
            return false;
          }
        },
        wait: async (selector, timeout = 30000) => {
          try {
            await this.page.waitForSelector(selector, { state: 'visible', timeout });
            return true;
          } catch {
            return false;
          }
        },
        getText: async (selector) => {
          try {
            const el = await this.page.$(selector);
            return el?.textContent() ?? null;
          } catch {
            return null;
          }
        },
        exists: async (selector) => {
          try {
            const el = await this.page.$(selector);
            return el !== null;
          } catch {
            return false;
          }
        },
        evaluate: async (fn) => {
          return this.page.evaluate(fn);
        },
        screenshot: async (name) => {
          return this.screenshot(name);
        },
      },
    });

    // 执行初始化前脚本
    if (this.configDriven.scripts?.beforeStart) {
      await this.executeScript(this.configDriven.scripts.beforeStart);
    }
  }

  /**
   * 从配置文件加载
   */
  static async fromConfigFile(configPath: string, platformName: string): Promise<ConfigAdapter> {
    const loader = new ConfigLoader(configPath);
    const config = loader.load();

    const validation = loader.validate(config);
    if (!validation.valid) {
      throw new Error(`配置验证失败: ${validation.errors.join(', ')}`);
    }

    const platform = config.platforms.find((p) => p.name === platformName);
    if (!platform) {
      throw new Error(`平台配置不存在: ${platformName}`);
    }

    const adapterConfig = this.platformToAdapterConfig(platform, config.global);
    return new ConfigAdapter(adapterConfig);
  }

  /**
   * 平台配置转换为适配器配置
   */
  private static platformToAdapterConfig(platform: PlatformConfig, globalConfig?: any): ConfigDrivenConfig {
    return {
      name: platform.name,
      targetUrl: platform.url,
      loginUrl: platform.loginUrl,
      startTime: platform.timing?.startTime ? new Date(platform.timing.startTime) : undefined,
      buttonSelectors: platform.selectors.button,
      successSelectors: platform.selectors.success,
      failureSelectors: platform.selectors.failure,
      formData: platform.formData,
      globalConfig,
      workflow: platform.workflow,
      pageLoadSelector: platform.selectors.pageLoad,
      preCheckSelector: platform.selectors.preCheck,
    };
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
    if (!this.configDriven.failureSelectors || this.configDriven.failureSelectors.length === 0) {
      return false;
    }

    try {
      for (const selector of this.configDriven.failureSelectors) {
        const element = await this.page.$(selector);
        if (!element) continue;

        if (this.configDriven.failureText) {
          const text = await element.textContent();
          if (text?.includes(this.configDriven.failureText)) {
            return true;
          }
        } else if (await element.isVisible()) {
          return true;
        }
      }

      return false;
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
   * 检测是否成功（基于选择器）
   */
  async checkSuccessBySelector(): Promise<boolean> {
    if (!this.configDriven.successSelectors || this.configDriven.successSelectors.length === 0) {
      return true;
    }

    for (const selector of this.configDriven.successSelectors) {
      try {
        const element = await this.page.$(selector);
        if (element && await element.isVisible()) {
          return true;
        }
      } catch {
        // 继续检查下一个
      }
    }

    return false;
  }

  /**
   * 执行脚本
   */
  async executeScript(scriptConfig: ScriptConfig): Promise<ScriptResult> {
    const startTime = Date.now();

    try {
      let result: ScriptResult;

      if (scriptConfig.type === 'inline' && scriptConfig.content) {
        result = await this.scriptExecutor.execute(
          scriptConfig.content,
          scriptConfig.params,
          scriptConfig.timeout
        );
      } else if (scriptConfig.type === 'file' && scriptConfig.path) {
        result = await this.scriptExecutor.executeFile(
          scriptConfig.path,
          scriptConfig.params,
          scriptConfig.timeout
        );
      } else {
        throw new Error(`不支持的脚本类型: ${scriptConfig.type}`);
      }

      logger.info(`脚本执行完成: ${result.success ? '成功' : '失败'}, 耗时 ${result.duration}ms`);
      return result;
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        duration: Date.now() - startTime,
        logs: [],
      };
    }
  }

  /**
   * 增强的抢票流程
   */
  async enhancedGrab(): Promise<boolean> {
    logger.info(`[${this.config.name}] 增强抢票流程开始`);

    // 预检查
    const canGrab = await this.preCheck();
    if (!canGrab) {
      logger.info(`[${this.config.name}] 预检查失败，等待条件满足`);
      await this.waitForPreCheck();
    }

    // 执行基础抢票流程
    const result = await this.startGrab();

    // 执行点击后脚本
    if (this.configDriven.scripts?.afterClick) {
      await this.executeScript(this.configDriven.scripts.afterClick);
    }

    if (!result) {
      // 检查失败原因
      const failed = await this.checkFailure();
      if (failed) {
        logger.warn(`[${this.config.name}] 检测到失败提示`);

        // 执行错误脚本
        if (this.configDriven.scripts?.onError) {
          await this.executeScript(this.configDriven.scripts.onError);
        }
      }
      return false;
    }

    // 检查是否成功（URL 或选择器）
    const successByUrl = await this.checkSuccessByUrl();
    const successBySelector = await this.checkSuccessBySelector();

    return successByUrl || successBySelector;
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
        logger.info(`[${this.config.name}] 预检查条件已满足`);
        return;
      }

      await this.page.reload({ waitUntil: 'domcontentloaded' });
      await this.sleep(interval);
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
      // 执行填充前脚本
      if (this.configDriven.scripts?.beforeFill) {
        await this.executeScript(this.configDriven.scripts.beforeFill);
      }

      await this.fillOrderForm();

      // 执行填充后脚本
      if (this.configDriven.scripts?.afterFill) {
        await this.executeScript(this.configDriven.scripts.afterFill);
      }
    }

    return result;
  }

  /**
   * 创建成功检测条件
   */
  static createSuccessCondition(successSelectors: string[]): (page: Page) => Promise<boolean> {
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

  /**
   * 创建失败检测条件
   */
  static createFailureCondition(
    failureSelectors: string[],
    failureText?: string
  ): (page: Page) => Promise<boolean> {
    return async (page: Page) => {
      for (const selector of failureSelectors) {
        try {
          const element = await page.$(selector);
          if (!element) continue;

          if (failureText) {
            const text = await element.textContent();
            if (text?.includes(failureText)) {
              return true;
            }
          } else if (await element.isVisible()) {
            return true;
          }
        } catch {
          // 继续检查
        }
      }
      return false;
    };
  }
}

// ==================== 脚本 API 示例 ====================

/**
 * 脚本 API 文档
 *
 * 在自定义脚本中，可以使用以下 API：
 *
 * 1. 页面操作：
 *    - page: Playwright Page 对象
 *    - utils.click(selector): 点击元素
 *    - utils.fill(selector, value): 填充输入框
 *    - utils.wait(selector, timeout): 等待元素
 *    - utils.getText(selector): 获取元素文本
 *    - utils.exists(selector): 检查元素是否存在
 *    - utils.evaluate(fn): 执行页面脚本
 *    - utils.screenshot(name): 截图
 *
 * 2. 工具函数：
 *    - log(message): 记录日志
 *    - sleep(ms): 等待指定时间
 *
 * 3. 数据访问：
 *    - config: 配置数据
 *    - userData: 用户数据
 *
 * 示例脚本：
 *
 * // 等待按钮可用并点击
 * await utils.wait('#buy-button');
 * const text = await utils.getText('#status');
 * if (text?.includes('立即购买')) {
 *   await utils.click('#buy-button');
 *   log('点击购买按钮成功');
 * }
 *
 * // 填充表单
 * await utils.fill('#name', config.userName);
 * await utils.fill('#phone', config.userPhone);
 *
 * // 检查结果
 * const success = await utils.exists('.success-message');
 * if (success) {
 *   log('抢票成功！');
 *   await utils.screenshot('success');
 * }
 */

export default ConfigAdapter;