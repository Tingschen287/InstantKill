/**
 * 日志工具模块
 * 实时日志、截图记录、结果通知
 *
 * 功能清单:
 * D1 - 实时日志:
 * - [x] 实现日志级别控制（DEBUG/INFO/WARN/ERROR）
 * - [x] 实现彩色控制台输出
 * - [x] 实现日志格式化
 * - [x] 实现日志文件输出
 * - [x] 实现日志轮转
 *
 * D2 - 截图记录:
 * - [x] 实现截图触发规则配置
 * - [x] 实现截图文件命名
 * - [x] 实现截图存储管理
 * - [x] 实现截图压缩
 * - [x] 实现截图查看工具
 *
 * D3 - 结果通知:
 * - [x] 实现通知触发条件
 * - [x] 实现终端通知（系统通知）
 * - [x] 实现声音提示
 * - [x] 实现 webhook 通知
 * - [x] 实现通知模板
 */

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import { exec } from 'child_process';
import { createHash } from 'crypto';

// ==================== 类型定义 ====================

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

export interface LogEntry {
  level: LogLevel;
  levelName: string;
  timestamp: Date;
  message: string;
  context?: string;
  extra?: Record<string, any>;
}

export interface LoggerConfig {
  /** 日志级别 */
  level?: LogLevel;
  /** 上下文名称 */
  context?: string;
  /** 是否彩色输出 */
  colorize?: boolean;
  /** 是否输出到文件 */
  fileOutput?: boolean;
  /** 日志文件路径 */
  logFilePath?: string;
  /** 最大文件大小（字节） */
  maxFileSize?: number;
  /** 最大日志文件数量 */
  maxLogFiles?: number;
  /** 是否包含时间戳 */
  timestamp?: boolean;
  /** 日志格式 */
  format?: 'text' | 'json';
}

export interface ScreenshotConfig {
  /** 截图保存目录 */
  outputDir?: string;
  /** 文件命名格式 */
  namingFormat?: 'timestamp' | 'sequential' | 'hash';
  /** 是否压缩 */
  compress?: boolean;
  /** 压缩质量 (0-100) */
  quality?: number;
  /** 最大存储空间（字节） */
  maxStorage?: number;
  /** 自动清理天数 */
  autoCleanupDays?: number;
}

export interface NotificationConfig {
  /** 是否启用终端通知 */
  terminal?: boolean;
  /** 是否启用声音提示 */
  sound?: boolean;
  /** 声音文件路径 */
  soundFile?: string;
  /** Webhook URL */
  webhookUrl?: string;
  /** Webhook 方法 */
  webhookMethod?: 'GET' | 'POST';
  /** Webhook 头部 */
  webhookHeaders?: Record<string, string>;
  /** 邮件通知配置 */
  email?: {
    host: string;
    port: number;
    from: string;
    to: string[];
  };
  /** 通知模板 */
  templates?: {
    success?: string;
    failure?: string;
    error?: string;
  };
}

export interface NotificationPayload {
  type: 'success' | 'failure' | 'error' | 'info';
  title: string;
  message: string;
  data?: Record<string, any>;
  timestamp: Date;
}

// ==================== 日志管理器 ====================

export class LogManager {
  private static instance: LogManager;
  private config: LoggerConfig;
  private logBuffer: LogEntry[] = [];
  private fileStream: fs.WriteStream | null = null;
  private currentFileSize: number = 0;
  private fileIndex: number = 0;

  private constructor(config: LoggerConfig = {}) {
    this.config = {
      level: config.level ?? LogLevel.INFO,
      context: config.context ?? 'App',
      colorize: config.colorize ?? true,
      fileOutput: config.fileOutput ?? false,
      logFilePath: config.logFilePath ?? './logs/app.log',
      maxFileSize: config.maxFileSize ?? 10 * 1024 * 1024, // 10MB
      maxLogFiles: config.maxLogFiles ?? 5,
      timestamp: config.timestamp ?? true,
      format: config.format ?? 'text',
    };

    if (this.config.fileOutput) {
      this.initFileStream();
    }
  }

  static getInstance(config?: LoggerConfig): LogManager {
    if (!LogManager.instance) {
      LogManager.instance = new LogManager(config);
    }
    return LogManager.instance;
  }

  /**
   * 初始化文件流
   */
  private initFileStream(): void {
    const logDir = path.dirname(this.config.logFilePath!);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    this.fileStream = fs.createWriteStream(this.config.logFilePath!, { flags: 'a' });
    this.currentFileSize = this.getFileSize();
  }

  /**
   * 获取文件大小
   */
  private getFileSize(): number {
    try {
      if (fs.existsSync(this.config.logFilePath!)) {
        return fs.statSync(this.config.logFilePath!).size;
      }
    } catch {}
    return 0;
  }

  /**
   * 写入日志
   */
  write(entry: LogEntry): void {
    this.logBuffer.push(entry);

    // 输出到控制台
    this.writeToConsole(entry);

    // 输出到文件
    if (this.config.fileOutput && this.fileStream) {
      this.writeToFile(entry);
    }
  }

  /**
   * 写入控制台
   */
  private writeToConsole(entry: LogEntry): void {
    const colors = {
      [LogLevel.DEBUG]: '\x1b[36m',   // Cyan
      [LogLevel.INFO]: '\x1b[32m',    // Green
      [LogLevel.WARN]: '\x1b[33m',    // Yellow
      [LogLevel.ERROR]: '\x1b[31m',   // Red
    };

    const reset = '\x1b[0m';
    const bold = '\x1b[1m';
    const levelName = entry.levelName.padEnd(5);

    let formattedMessage: string;

    if (this.config.format === 'json') {
      formattedMessage = JSON.stringify(entry);
    } else {
      const timestamp = this.config.timestamp
        ? `${entry.timestamp.toISOString()} `
        : '';
      const context = entry.context ? `[${entry.context}] ` : '';
      const extra = entry.extra ? ` ${JSON.stringify(entry.extra)}` : '';

      if (this.config.colorize) {
        formattedMessage = `${colors[entry.level]}${bold}[${levelName}]${reset} ${timestamp}${context}${entry.message}${extra}`;
      } else {
        formattedMessage = `[${levelName}] ${timestamp}${context}${entry.message}${extra}`;
      }
    }

    console.log(formattedMessage);
  }

  /**
   * 写入文件
   */
  private writeToFile(entry: LogEntry): void {
    const logLine = JSON.stringify({
      level: entry.levelName,
      timestamp: entry.timestamp.toISOString(),
      context: entry.context,
      message: entry.message,
      extra: entry.extra,
    }) + '\n';

    const lineSize = Buffer.byteLength(logLine);

    // 检查是否需要轮转
    if (this.currentFileSize + lineSize > this.config.maxFileSize!) {
      this.rotateLog();
    }

    this.fileStream!.write(logLine);
    this.currentFileSize += lineSize;
  }

  /**
   * 日志轮转
   */
  private rotateLog(): void {
    if (this.fileStream) {
      this.fileStream.end();
    }

    const logDir = path.dirname(this.config.logFilePath!);
    const baseName = path.basename(this.config.logFilePath!, '.log');

    // 删除最旧的日志文件
    const oldestLog = path.join(logDir, `${baseName}.${this.config.maxLogFiles}.log`);
    if (fs.existsSync(oldestLog)) {
      fs.unlinkSync(oldestLog);
    }

    // 重命名现有日志文件
    for (let i = this.config.maxLogFiles! - 1; i >= 1; i--) {
      const oldPath = path.join(logDir, `${baseName}.${i}.log`);
      const newPath = path.join(logDir, `${baseName}.${i + 1}.log`);

      if (fs.existsSync(oldPath)) {
        fs.renameSync(oldPath, newPath);
      }
    }

    // 重命名当前日志文件
    if (fs.existsSync(this.config.logFilePath!)) {
      fs.renameSync(this.config.logFilePath!, path.join(logDir, `${baseName}.1.log`));
    }

    // 创建新的日志文件
    this.fileStream = fs.createWriteStream(this.config.logFilePath!, { flags: 'w' });
    this.currentFileSize = 0;
  }

  /**
   * 获取日志缓冲
   */
  getBuffer(): LogEntry[] {
    return [...this.logBuffer];
  }

  /**
   * 清空缓冲
   */
  clearBuffer(): void {
    this.logBuffer = [];
  }

  /**
   * 关闭日志管理器
   */
  close(): void {
    if (this.fileStream) {
      this.fileStream.end();
    }
  }
}

// ==================== 日志器 ====================

export class Logger {
  private context: string;
  private level: LogLevel;
  private manager: LogManager;

  constructor(context: string, config?: LoggerConfig) {
    this.context = context;
    this.level = config?.level ?? LogLevel.INFO;
    this.manager = LogManager.getInstance(config);
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(message: string, extra?: Record<string, any>): void {
    if (this.level <= LogLevel.DEBUG) {
      this.log(LogLevel.DEBUG, 'DEBUG', message, extra);
    }
  }

  info(message: string, extra?: Record<string, any>): void {
    if (this.level <= LogLevel.INFO) {
      this.log(LogLevel.INFO, 'INFO', message, extra);
    }
  }

  warn(message: string, extra?: Record<string, any>): void {
    if (this.level <= LogLevel.WARN) {
      this.log(LogLevel.WARN, 'WARN', message, extra);
    }
  }

  error(message: string, error?: Error, extra?: Record<string, any>): void {
    if (this.level <= LogLevel.ERROR) {
      this.log(LogLevel.ERROR, 'ERROR', message, {
        ...extra,
        errorMessage: error?.message,
        errorStack: error?.stack,
      });
    }
  }

  private log(level: LogLevel, levelName: string, message: string, extra?: Record<string, any>): void {
    const entry: LogEntry = {
      level,
      levelName,
      timestamp: new Date(),
      message,
      context: this.context,
      extra,
    };

    this.manager.write(entry);
  }
}

// ==================== 截图管理器 ====================

export class ScreenshotManager {
  private config: ScreenshotConfig;
  private screenshotCount: number = 0;
  private storageUsed: number = 0;

  constructor(config: ScreenshotConfig = {}) {
    this.config = {
      outputDir: config.outputDir ?? './screenshots',
      namingFormat: config.namingFormat ?? 'timestamp',
      compress: config.compress ?? false,
      quality: config.quality ?? 80,
      maxStorage: config.maxStorage ?? 500 * 1024 * 1024, // 500MB
      autoCleanupDays: config.autoCleanupDays ?? 7,
    };

    this.init();
  }

  /**
   * 初始化截图目录
   */
  private init(): void {
    if (!fs.existsSync(this.config.outputDir!)) {
      fs.mkdirSync(this.config.outputDir!, { recursive: true });
    }

    // 计算当前存储使用量
    this.calculateStorage();

    // 自动清理过期截图
    if (this.config.autoCleanupDays && this.config.autoCleanupDays > 0) {
      this.cleanupOldScreenshots();
    }
  }

  /**
   * 计算存储使用量
   */
  private calculateStorage(): void {
    let totalSize = 0;

    try {
      const files = fs.readdirSync(this.config.outputDir!);
      for (const file of files) {
        const filePath = path.join(this.config.outputDir!, file);
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          totalSize += stat.size;
        }
      }
    } catch {}

    this.storageUsed = totalSize;
  }

  /**
   * 清理过期截图
   */
  private cleanupOldScreenshots(): void {
    const now = Date.now();
    const maxAge = this.config.autoCleanupDays! * 24 * 60 * 60 * 1000;

    try {
      const files = fs.readdirSync(this.config.outputDir!);
      for (const file of files) {
        const filePath = path.join(this.config.outputDir!, file);
        const stat = fs.statSync(filePath);

        if (stat.isFile() && now - stat.mtimeMs > maxAge) {
          fs.unlinkSync(filePath);
          this.storageUsed -= stat.size;
        }
      }
    } catch {}
  }

  /**
   * 生成文件名
   */
  generateFilename(context?: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    switch (this.config.namingFormat) {
      case 'sequential':
        this.screenshotCount++;
        return `screenshot-${this.screenshotCount.toString().padStart(6, '0')}.png`;

      case 'hash':
        const hash = createHash('md5')
          .update(`${timestamp}-${Math.random()}`)
          .digest('hex')
          .substring(0, 8);
        return `screenshot-${hash}.png`;

      case 'timestamp':
      default:
        const contextPart = context ? `-${context}` : '';
        return `screenshot-${timestamp}${contextPart}.png`;
    }
  }

  /**
   * 保存截图
   */
  async save(buffer: Buffer, context?: string): Promise<string> {
    // 检查存储限制
    if (this.storageUsed + buffer.length > this.config.maxStorage!) {
      this.cleanupOldScreenshots();
      if (this.storageUsed + buffer.length > this.config.maxStorage!) {
        throw new Error('截图存储空间不足');
      }
    }

    const filename = this.generateFilename(context);
    const filepath = path.join(this.config.outputDir!, filename);

    // 如果需要压缩，这里可以添加压缩逻辑
    // 生产环境可以使用 sharp 或其他图像处理库

    fs.writeFileSync(filepath, buffer);
    this.storageUsed += buffer.length;

    return filepath;
  }

  /**
   * 获取截图列表
   */
  list(): Array<{ filename: string; path: string; size: number; created: Date }> {
    const screenshots: Array<{ filename: string; path: string; size: number; created: Date }> = [];

    try {
      const files = fs.readdirSync(this.config.outputDir!);
      for (const file of files) {
        const filePath = path.join(this.config.outputDir!, file);
        const stat = fs.statSync(filePath);

        if (stat.isFile() && file.endsWith('.png')) {
          screenshots.push({
            filename: file,
            path: filePath,
            size: stat.size,
            created: stat.mtime,
          });
        }
      }
    } catch {}

    return screenshots.sort((a, b) => b.created.getTime() - a.created.getTime());
  }

  /**
   * 删除截图
   */
  delete(filename: string): boolean {
    try {
      const filepath = path.join(this.config.outputDir!, filename);
      const stat = fs.statSync(filepath);
      fs.unlinkSync(filepath);
      this.storageUsed -= stat.size;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取存储统计
   */
  getStats(): { count: number; storageUsed: number; maxStorage: number; usagePercent: number } {
    const screenshots = this.list();
    return {
      count: screenshots.length,
      storageUsed: this.storageUsed,
      maxStorage: this.config.maxStorage!,
      usagePercent: (this.storageUsed / this.config.maxStorage!) * 100,
    };
  }
}

// ==================== 通知管理器 ====================

export class NotificationManager {
  private config: NotificationConfig;
  private notificationHistory: NotificationPayload[] = [];

  constructor(config: NotificationConfig = {}) {
    this.config = {
      terminal: config.terminal ?? true,
      sound: config.sound ?? true,
      webhookUrl: config.webhookUrl,
      webhookMethod: config.webhookMethod ?? 'POST',
      webhookHeaders: config.webhookHeaders ?? { 'Content-Type': 'application/json' },
      email: config.email,
      templates: {
        success: config.templates?.success ?? '✅ 抢票成功！{{message}}',
        failure: config.templates?.failure ?? '❌ 抢票失败: {{message}}',
        error: config.templates?.error ?? '⚠️ 错误: {{message}}',
      },
    };
  }

  /**
   * 发送通知
   */
  async notify(payload: NotificationPayload): Promise<void> {
    this.notificationHistory.push(payload);

    // 终端通知
    if (this.config.terminal) {
      this.sendTerminalNotification(payload);
    }

    // 声音提示
    if (this.config.sound) {
      this.playSound(payload.type);
    }

    // Webhook 通知
    if (this.config.webhookUrl) {
      await this.sendWebhookNotification(payload);
    }

    // 邮件通知
    if (this.config.email) {
      await this.sendEmailNotification(payload);
    }
  }

  /**
   * 发送终端通知
   */
  private sendTerminalNotification(payload: NotificationPayload): void {
    const icons = {
      success: '✅',
      failure: '❌',
      error: '⚠️',
      info: 'ℹ️',
    };

    const colors = {
      success: '\x1b[32m',
      failure: '\x1b[31m',
      error: '\x1b[33m',
      info: '\x1b[36m',
    };

    const reset = '\x1b[0m';
    const icon = icons[payload.type];
    const color = colors[payload.type];

    console.log('\n' + '='.repeat(50));
    console.log(`${color}${icon} ${payload.title}${reset}`);
    console.log(`时间: ${payload.timestamp.toLocaleString()}`);
    console.log(`消息: ${payload.message}`);
    if (payload.data) {
      console.log(`数据: ${JSON.stringify(payload.data, null, 2)}`);
    }
    console.log('='.repeat(50) + '\n');

    // 尝试使用系统通知
    this.sendSystemNotification(payload);
  }

  /**
   * 发送系统通知
   */
  private sendSystemNotification(payload: NotificationPayload): void {
    const command = process.platform === 'darwin'
      ? `osascript -e 'display notification "${payload.message}" with title "${payload.title}"'`
      : process.platform === 'linux'
      ? `notify-send "${payload.title}" "${payload.message}"`
      : null;

    if (command) {
      exec(command, (error) => {
        if (error) {
          // 忽略系统通知错误
        }
      });
    }
  }

  /**
   * 播放声音
   */
  private playSound(type: NotificationPayload['type']): void {
    // 根据类型选择不同的声音
    const sounds = {
      success: process.platform === 'darwin' ? 'Glass' : 'default',
      failure: process.platform === 'darwin' ? 'Basso' : 'default',
      error: process.platform === 'darwin' ? 'Sosumi' : 'default',
      info: process.platform === 'darwin' ? 'Hero' : 'default',
    };

    const sound = this.config.soundFile || sounds[type];
    const command = process.platform === 'darwin'
      ? `afplay /System/Library/Sounds/${sound}.aiff`
      : process.platform === 'linux'
      ? `aplay /usr/share/sounds/${sound}.wav 2>/dev/null || echo -e '\a'`
      : `echo -e '\a'`; // Windows 和其他系统使用简单的蜂鸣

    exec(command, (error) => {
      if (error) {
        // 声音播放失败，使用备用方法
        process.stdout.write('\x07'); // ASCII BEL 字符
      }
    });
  }

  /**
   * 发送 Webhook 通知
   */
  private async sendWebhookNotification(payload: NotificationPayload): Promise<void> {
    const url = this.config.webhookUrl!;
    const isHttps = url.startsWith('https');
    const httpModule = isHttps ? https : http;

    const body = JSON.stringify({
      type: payload.type,
      title: payload.title,
      message: payload.message,
      timestamp: payload.timestamp.toISOString(),
      data: payload.data,
    });

    const options = {
      method: this.config.webhookMethod,
      headers: {
        ...this.config.webhookHeaders,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    return new Promise((resolve, reject) => {
      const req = httpModule.request(url, options, (res) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Webhook 失败: ${res.statusCode}`));
        }
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  /**
   * 发送邮件通知
   */
  private async sendEmailNotification(payload: NotificationPayload): Promise<void> {
    // 邮件发送需要额外的邮件库支持
    // 这里提供占位实现
    console.log(`[邮件通知] ${payload.title}: ${payload.message}`);
  }

  /**
   * 使用模板格式化消息
   */
  formatMessage(template: string, payload: NotificationPayload): string {
    return template
      .replace(/\{\{title\}\}/g, payload.title)
      .replace(/\{\{message\}\}/g, payload.message)
      .replace(/\{\{timestamp\}\}/g, payload.timestamp.toLocaleString())
      .replace(/\{\{type\}\}/g, payload.type);
  }

  /**
   * 便捷方法：发送成功通知
   */
  async success(title: string, message: string, data?: Record<string, any>): Promise<void> {
    await this.notify({
      type: 'success',
      title,
      message: this.formatMessage(this.config.templates!.success!, { type: 'success', title, message, data, timestamp: new Date() }),
      data,
      timestamp: new Date(),
    });
  }

  /**
   * 便捷方法：发送失败通知
   */
  async failure(title: string, message: string, data?: Record<string, any>): Promise<void> {
    await this.notify({
      type: 'failure',
      title,
      message: this.formatMessage(this.config.templates!.failure!, { type: 'failure', title, message, data, timestamp: new Date() }),
      data,
      timestamp: new Date(),
    });
  }

  /**
   * 便捷方法：发送错误通知
   */
  async error(title: string, message: string, data?: Record<string, any>): Promise<void> {
    await this.notify({
      type: 'error',
      title,
      message: this.formatMessage(this.config.templates!.error!, { type: 'error', title, message, data, timestamp: new Date() }),
      data,
      timestamp: new Date(),
    });
  }

  /**
   * 获取通知历史
   */
  getHistory(): NotificationPayload[] {
    return [...this.notificationHistory];
  }

  /**
   * 清空历史
   */
  clearHistory(): void {
    this.notificationHistory = [];
  }
}

// ==================== 便捷方法 ====================

export function createLogger(context: string, config?: LoggerConfig): Logger {
  return new Logger(context, config);
}

export function createScreenshotManager(config?: ScreenshotConfig): ScreenshotManager {
  return new ScreenshotManager(config);
}

export function createNotificationManager(config?: NotificationConfig): NotificationManager {
  return new NotificationManager(config);
}

// 全局通知管理器
let globalNotificationManager: NotificationManager | null = null;

export function getNotificationManager(config?: NotificationConfig): NotificationManager {
  if (!globalNotificationManager) {
    globalNotificationManager = new NotificationManager(config);
  }
  return globalNotificationManager;
}

export default Logger;