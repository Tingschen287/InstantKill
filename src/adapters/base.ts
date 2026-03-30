/**
 * 基础平台适配器模块
 * 提供抢票操作的基础抽象
 *
 * 功能清单:
 * C1 - 通用适配器:
 * - [x] 设计配置文件格式（YAML/JSON）
 * - [x] 实现选择器配置解析
 * - [x] 实现流程配置执行
 * - [x] 实现条件分支支持
 * - [x] 实现示例配置模板
 *
 * C3 - 配置管理:
 * - [x] 实现配置文件读取
 * - [x] 实现配置文件验证
 * - [x] 实现配置热重载
 * - [x] 实现配置加密存储
 * - [x] 实现配置导入导出
 */

import { Page, Browser } from 'playwright';
import { BrowserEngine } from '../engine/browser.js';
import { PageMonitor } from '../engine/monitor.js';
import { RefreshStrategy } from '../strategies/refresh.js';
import { ClickStrategy, ButtonStateMonitor } from '../strategies/click.js';
import { FillStrategy, UserConfigManager } from '../strategies/fill.js';
import { RetryManager, quickRetry } from '../engine/retry.js';
import { createLogger } from '../utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const logger = createLogger('BaseAdapter');

// ==================== 类型定义 ====================

export interface SelectorConfig {
  /** 抢票按钮选择器 */
  button: string[];
  /** 输入框选择器 */
  input?: Record<string, string>;
  /** 成功检测选择器 */
  success: string[];
  /** 失败检测选择器 */
  failure?: string[];
  /** 预检查选择器 */
  preCheck?: string;
  /** 页面加载等待选择器 */
  pageLoad?: string;
}

export interface TimingConfig {
  /** 开始抢票时间 */
  startTime?: string;
  /** 刷新间隔（毫秒） */
  refreshInterval?: number;
  /** 提前准备时间（毫秒） */
  prepareTime?: number;
  /** 超时时间 */
  timeout?: number;
}

export interface FormDataConfig {
  /** 输入框数据 */
  inputs?: Record<string, string>;
  /** 下拉框数据 */
  selects?: Record<string, string>;
  /** 复选框数据 */
  checkboxes?: Record<string, boolean>;
}

export interface NotificationConfig {
  /** 终端通知 */
  terminal?: boolean;
  /** 声音提示 */
  sound?: boolean;
  /** Webhook URL */
  webhookUrl?: string;
  /** 邮件通知 */
  email?: string;
}

export interface GlobalConfig {
  /** 无头模式 */
  headless?: boolean;
  /** 人类化操作 */
  humanMode?: boolean;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 默认超时时间 */
  defaultTimeout?: number;
  /** 启用日志 */
  enableLogging?: boolean;
  /** 启用截图 */
  enableScreenshot?: boolean;
  /** 截图保存路径 */
  screenshotPath?: string;
  /** 通知配置 */
  notifications?: NotificationConfig;
}

export interface PlatformConfig {
  /** 平台名称 */
  name: string;
  /** 目标 URL */
  url: string;
  /** 是否需要登录 */
  loginRequired?: boolean;
  /** 登录 URL */
  loginUrl?: string;
  /** 选择器配置 */
  selectors: SelectorConfig;
  /** 表单数据 */
  formData?: FormDataConfig;
  /** 时间配置 */
  timing?: TimingConfig;
  /** 流程配置 */
  workflow?: WorkflowStep[];
}

export interface ConfigFile {
  version: string;
  platforms: PlatformConfig[];
  global?: GlobalConfig;
}

export interface AdapterConfig {
  /** 平台名称 */
  name: string;
  /** 目标 URL */
  targetUrl: string;
  /** 登录 URL */
  loginUrl?: string;
  /** 抢票开始时间 */
  startTime?: Date;
  /** 抢票按钮选择器 */
  buttonSelectors: string[];
  /** 成功检测选择器 */
  successSelectors?: string[];
  /** 失败检测选择器 */
  failureSelectors?: string[];
  /** 表单数据 */
  formData?: FormDataConfig;
  /** 成功检测条件 */
  successCondition?: (page: Page) => Promise<boolean>;
  /** 失败检测条件 */
  failureCondition?: (page: Page) => Promise<boolean>;
  /** 全局配置 */
  globalConfig?: GlobalConfig;
  /** 流程配置 */
  workflow?: WorkflowStep[];
}

export interface WorkflowStep {
  /** 步骤名称 */
  name: string;
  /** 步骤类型 */
  type: 'navigate' | 'click' | 'fill' | 'wait' | 'refresh' | 'check' | 'script' | 'condition';
  /** 选择器 */
  selector?: string;
  /** 值 */
  value?: string;
  /** 条件 */
  condition?: string;
  /** 超时 */
  timeout?: number;
  /** 子步骤（条件分支） */
  thenSteps?: WorkflowStep[];
  elseSteps?: WorkflowStep[];
  /** 重试次数 */
  retries?: number;
}

export interface AdapterState {
  status: 'idle' | 'initializing' | 'running' | 'paused' | 'success' | 'failed' | 'stopped';
  currentStep?: string;
  attempts: number;
  startTime?: number;
  endTime?: number;
  lastError?: string;
  screenshots: string[];
}

// ==================== 配置管理器 ====================

export class ConfigLoader {
  private configPath: string;
  private config: ConfigFile | null = null;
  private lastModified: number = 0;
  private watchers: ((config: ConfigFile) => void)[] = [];

  constructor(configPath: string = './configs/platform.yaml') {
    this.configPath = configPath;
  }

  /**
   * 加载配置文件
   */
  load(): ConfigFile {
    try {
      if (!fs.existsSync(this.configPath)) {
        throw new Error(`配置文件不存在: ${this.configPath}`);
      }

      const content = fs.readFileSync(this.configPath, 'utf-8');
      const ext = path.extname(this.configPath).toLowerCase();

      if (ext === '.json') {
        this.config = JSON.parse(content);
      } else if (ext === '.yaml' || ext === '.yml') {
        // 简单 YAML 解析（生产环境应使用 yaml 库）
        this.config = this.parseSimpleYaml(content);
      } else {
        throw new Error(`不支持的配置文件格式: ${ext}`);
      }

      this.lastModified = fs.statSync(this.configPath).mtimeMs;
      logger.info(`配置文件加载成功: ${this.configPath}`);

      return this.config!;
    } catch (error) {
      logger.error(`加载配置文件失败: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 简单 YAML 解析器
   * 支持基本的键值对和嵌套结构
   */
  private parseSimpleYaml(content: string): ConfigFile {
    const lines = content.split('\n');
    const result: any = {};
    let currentPath: string[] = [];
    const indentStack: number[] = [-1];

    for (const line of lines) {
      // 跳过注释和空行
      if (line.trim().startsWith('#') || line.trim() === '') continue;

      // 计算缩进
      const indent = line.search(/\S/);
      const trimmed = line.trim();

      // 处理缩进层级
      while (indent <= indentStack[indentStack.length - 1]) {
        indentStack.pop();
        currentPath.pop();
      }

      // 解析键值对
      if (trimmed.includes(':')) {
        const colonIndex = trimmed.indexOf(':');
        const key = trimmed.substring(0, colonIndex).trim();
        let value: any = trimmed.substring(colonIndex + 1).trim();

        // 处理不同类型的值
        if (value === '' || value === null) {
          value = {};
        } else if (value.startsWith('[') && value.endsWith(']')) {
          // 数组
          value = value.slice(1, -1).split(',').map(v => v.trim().replace(/"/g, ''));
        } else if (value.startsWith('"') && value.endsWith('"')) {
          // 字符串
          value = value.slice(1, -1);
        } else if (value === 'true') {
          value = true;
        } else if (value === 'false') {
          value = false;
        } else if (!isNaN(Number(value))) {
          value = Number(value);
        }

        // 设置值
        let current: any = result;
        for (const p of currentPath) {
          current = current[p];
        }
        current[key] = value;

        // 更新路径
        if (typeof value === 'object' && !Array.isArray(value)) {
          currentPath.push(key);
          indentStack.push(indent);
        }
      }
    }

    return result as ConfigFile;
  }

  /**
   * 验证配置文件
   */
  validate(config: ConfigFile): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 验证版本
    if (!config.version) {
      errors.push('缺少 version 字段');
    }

    // 验证平台配置
    if (!config.platforms || !Array.isArray(config.platforms)) {
      errors.push('缺少 platforms 数组');
    } else {
      for (let i = 0; i < config.platforms.length; i++) {
        const platform = config.platforms[i];
        if (!platform.name) {
          errors.push(`平台 ${i}: 缺少 name 字段`);
        }
        if (!platform.url) {
          errors.push(`平台 ${i}: 缺少 url 字段`);
        }
        if (!platform.selectors?.button || platform.selectors.button.length === 0) {
          errors.push(`平台 ${i}: 缺少按钮选择器`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 监听配置文件变化（热重载）
   */
  watch(callback: (config: ConfigFile) => void): void {
    this.watchers.push(callback);

    // 使用 fs.watch 监听文件变化
    const dir = path.dirname(this.configPath);
    const filename = path.basename(this.configPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.watch(dir, (event, changedFile) => {
      if (changedFile === filename && event === 'change') {
        try {
          const newConfig = this.load();
          this.watchers.forEach((cb) => cb(newConfig));
        } catch (error) {
          logger.error(`热重载配置失败: ${(error as Error).message}`);
        }
      }
    });

    logger.info(`开始监听配置文件变化: ${this.configPath}`);
  }

  /**
   * 获取当前配置
   */
  getConfig(): ConfigFile | null {
    return this.config;
  }

  /**
   * 获取指定平台配置
   */
  getPlatformConfig(name: string): PlatformConfig | undefined {
    return this.config?.platforms.find((p) => p.name === name);
  }
}

// ==================== 配置加密器 ====================

export class ConfigEncryptor {
  private algorithm = 'aes-256-gcm';
  private key: Buffer;

  constructor(secretKey: string) {
    // 从密钥派生加密密钥
    this.key = crypto.createHash('sha256').update(secretKey).digest();
  }

  /**
   * 加密配置
   */
  encrypt(config: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    let encrypted = cipher.update(config, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // 返回 iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * 解密配置
   */
  decrypt(encryptedConfig: string): string {
    const parts = encryptedConfig.split(':');
    if (parts.length !== 3) {
      throw new Error('无效的加密配置格式');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * 加密并保存配置
   */
  encryptAndSave(config: ConfigFile, filePath: string): void {
    const jsonStr = JSON.stringify(config, null, 2);
    const encrypted = this.encrypt(jsonStr);

    // 确保目录存在
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, encrypted, 'utf8');
    logger.info(`配置已加密保存: ${filePath}`);
  }

  /**
   * 加载并解密配置
   */
  loadAndDecrypt(filePath: string): ConfigFile {
    const encrypted = fs.readFileSync(filePath, 'utf8');
    const decrypted = this.decrypt(encrypted);
    return JSON.parse(decrypted) as ConfigFile;
  }
}

// ==================== 基础适配器 ====================

export abstract class BaseAdapter {
  protected browser: BrowserEngine;
  protected page!: Page;
  protected monitor!: PageMonitor;
  protected buttonMonitor!: ButtonStateMonitor;
  protected refresh!: RefreshStrategy;
  protected click!: ClickStrategy;
  protected fill!: FillStrategy;
  protected config: AdapterConfig;
  protected userConfig: UserConfigManager;
  protected state: AdapterState;
  protected workflowIndex: number = 0;

  constructor(config: AdapterConfig) {
    this.config = config;
    this.browser = new BrowserEngine();
    this.userConfig = new UserConfigManager();
    this.state = {
      status: 'idle',
      attempts: 0,
      screenshots: [],
    };
  }

  /**
   * 初始化适配器
   */
  async initialize(): Promise<void> {
    this.state.status = 'initializing';
    this.state.startTime = Date.now();

    try {
      // 启动浏览器
      const headless = this.config.globalConfig?.headless ?? false;
      await this.browser.launch({ headless });

      // 创建页面
      this.page = await this.browser.newPage();

      // 初始化策略模块
      this.monitor = new PageMonitor(this.page);
      this.buttonMonitor = new ButtonStateMonitor(this.page);
      this.refresh = new RefreshStrategy(this.page);
      this.click = new ClickStrategy(this.page);
      this.fill = new FillStrategy(this.page);

      this.state.status = 'idle';
      logger.info(`[${this.config.name}] 适配器初始化完成`);
    } catch (error) {
      this.state.status = 'failed';
      this.state.lastError = (error as Error).message;
      throw error;
    }
  }

  /**
   * 导航到目标页面
   */
  async navigateToTarget(): Promise<void> {
    await this.browser.navigate(this.config.targetUrl);
    logger.info(`[${this.config.name}] 已导航到: ${this.config.targetUrl}`);
  }

  /**
   * 等待抢票开始
   */
  async waitForStart(): Promise<void> {
    if (!this.config.startTime) {
      logger.info(`[${this.config.name}] 无设定开始时间，立即开始`);
      return;
    }

    const now = Date.now();
    const start = this.config.startTime.getTime();
    const prepareTime = this.config.globalConfig?.defaultTimeout ?? 5000;

    if (start > now) {
      const waitTime = start - now - prepareTime;
      logger.info(`[${this.config.name}] 等待 ${Math.ceil(waitTime / 1000)} 秒`);
      await this.sleep(waitTime);
    }
  }

  /**
   * 执行工作流
   */
  async executeWorkflow(workflow?: WorkflowStep[]): Promise<boolean> {
    const steps = workflow ?? this.config.workflow ?? this.getDefaultWorkflow();
    this.workflowIndex = 0;

    for (const step of steps) {
      this.state.currentStep = step.name;
      logger.info(`[${this.config.name}] 执行步骤: ${step.name}`);

      try {
        const success = await this.executeStep(step);
        if (!success && step.type !== 'condition') {
          logger.warn(`[${this.config.name}] 步骤失败: ${step.name}`);
          return false;
        }
      } catch (error) {
        logger.error(`[${this.config.name}] 步骤异常: ${step.name} - ${(error as Error).message}`);

        // 重试
        if (step.retries && step.retries > 0) {
          for (let i = 0; i < step.retries; i++) {
            try {
              await this.sleep(1000);
              const retrySuccess = await this.executeStep(step);
              if (retrySuccess) break;
            } catch {
              // 继续重试
            }
          }
        }
      }

      this.workflowIndex++;
    }

    return true;
  }

  /**
   * 执行单个步骤
   */
  protected async executeStep(step: WorkflowStep): Promise<boolean> {
    const timeout = step.timeout ?? this.config.globalConfig?.defaultTimeout ?? 30000;

    switch (step.type) {
      case 'navigate':
        await this.browser.navigate(step.value ?? this.config.targetUrl);
        return true;

      case 'click':
        if (!step.selector) return false;
        await this.click.smartClick(step.selector);
        return true;

      case 'fill':
        if (!step.selector || !step.value) return false;
        await this.fill.fillInput(step.selector, step.value);
        return true;

      case 'wait':
        await this.sleep(parseInt(step.value ?? '1000'));
        return true;

      case 'refresh':
        await this.refresh.refresh();
        return true;

      case 'check':
        if (!step.selector) return false;
        const element = await this.page.$(step.selector);
        return element !== null;

      case 'script':
        // 执行自定义脚本
        if (step.value) {
          await this.page.evaluate(step.value);
        }
        return true;

      case 'condition':
        return await this.executeCondition(step);

      default:
        logger.warn(`未知步骤类型: ${step.type}`);
        return false;
    }
  }

  /**
   * 执行条件分支
   */
  protected async executeCondition(step: WorkflowStep): Promise<boolean> {
    if (!step.condition) return false;

    // 评估条件
    let conditionResult = false;

    try {
      // 支持简单的条件表达式
      if (step.condition.startsWith('selector:')) {
        const selector = step.condition.substring(9);
        conditionResult = await this.elementExists(selector);
      } else if (step.condition.startsWith('url:')) {
        const urlPattern = step.condition.substring(4);
        conditionResult = this.page.url().includes(urlPattern);
      } else if (step.condition.startsWith('text:')) {
        const text = step.condition.substring(5);
        conditionResult = (await this.page.content()).includes(text);
      }
    } catch {
      conditionResult = false;
    }

    // 执行对应分支
    if (conditionResult && step.thenSteps) {
      return this.executeWorkflow(step.thenSteps);
    } else if (!conditionResult && step.elseSteps) {
      return this.executeWorkflow(step.elseSteps);
    }

    return true;
  }

  /**
   * 获取默认工作流
   */
  protected getDefaultWorkflow(): WorkflowStep[] {
    return [
      { name: '导航到目标页面', type: 'navigate' },
      { name: '等待页面加载', type: 'wait', value: '2000' },
      {
        name: '检查按钮状态',
        type: 'condition',
        condition: `selector:${this.config.buttonSelectors[0]}`,
        thenSteps: [
          { name: '点击抢票按钮', type: 'click', selector: this.config.buttonSelectors[0] },
          { name: '等待响应', type: 'wait', value: '1000' },
        ],
        elseSteps: [
          { name: '刷新页面', type: 'refresh' },
        ],
      },
    ];
  }

  /**
   * 开始抢票
   */
  async startGrab(): Promise<boolean> {
    this.state.status = 'running';
    logger.info(`[${this.config.name}] 开始抢票`);

    // 如果有自定义工作流，执行工作流
    if (this.config.workflow) {
      return this.executeWorkflow();
    }

    // 默认抢票流程
    // 预加载按钮元素
    for (const selector of this.config.buttonSelectors) {
      await this.click.preloadElement(selector);
    }

    // 精确刷新到开始时间
    if (this.config.startTime) {
      await this.refresh.refreshAtTargetTime({
        targetTime: this.config.startTime,
        warmupCount: 2,
      });
    }

    // 监听并点击
    const result = await this.click.watchAndClick(
      this.config.buttonSelectors[0],
      {
        pollInterval: 50,
        timeout: 60000,
      }
    );

    if (!result.success) {
      logger.warn(`[${this.config.name}] 点击失败`);
      return false;
    }

    // 检查是否成功
    if (this.config.successCondition) {
      const success = await this.config.successCondition(this.page);
      this.state.status = success ? 'success' : 'failed';
      logger.info(`[${this.config.name}] 抢票结果: ${success ? '成功' : '失败'}`);
      return success;
    }

    this.state.status = 'success';
    return true;
  }

  /**
   * 填写订单表单
   */
  async fillOrderForm(): Promise<boolean> {
    if (!this.config.formData) {
      return true;
    }

    logger.info(`[${this.config.name}] 填写订单表单`);

    // 使用智能填充
    const result = await this.fill.smartFill();
    return result.success;
  }

  /**
   * 完整抢票流程
   */
  async runFullProcess(): Promise<boolean> {
    const retryManager = new RetryManager({
      maxRetries: this.config.globalConfig?.maxRetries ?? 3,
      initialDelay: 1000,
      operationName: '抢票流程',
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
    });

    this.state.endTime = Date.now();
    return result.success && result.result === true;
  }

  /**
   * 暂停抢票
   */
  pause(): void {
    this.state.status = 'paused';
    logger.info(`[${this.config.name}] 抢票已暂停`);
  }

  /**
   * 恢复抢票
   */
  resume(): void {
    this.state.status = 'running';
    logger.info(`[${this.config.name}] 抢票已恢复`);
  }

  /**
   * 停止抢票
   */
  stop(): void {
    this.state.status = 'stopped';
    logger.info(`[${this.config.name}] 抢票已停止`);
  }

  /**
   * 获取状态
   */
  getState(): AdapterState {
    return { ...this.state };
  }

  /**
   * 截图
   */
  async screenshot(name?: string): Promise<string> {
    const screenshotDir = this.config.globalConfig?.screenshotPath ?? './screenshots';
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    const filename = `${name ?? 'screenshot'}-${Date.now()}.png`;
    const filepath = path.join(screenshotDir, filename);

    await this.page.screenshot({ path: filepath, fullPage: false });
    this.state.screenshots.push(filepath);

    logger.debug(`截图已保存: ${filepath}`);
    return filepath;
  }

  /**
   * 关闭浏览器
   */
  async cleanup(): Promise<void> {
    await this.browser.close();
    logger.info(`[${this.config.name}] 适配器已关闭`);
  }

  // ==================== 辅助方法 ====================

  protected async elementExists(selector: string): Promise<boolean> {
    try {
      const element = await this.page.$(selector);
      return element !== null;
    } catch {
      return false;
    }
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default BaseAdapter;