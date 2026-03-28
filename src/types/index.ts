/**
 * TypeScript 类型定义
 */

import { Page } from 'playwright';

// 浏览器相关类型
export interface BrowserOptions {
  headless: boolean;
  slowMo?: number;
  viewport?: { width: number; height: number };
  userAgent?: string;
}

// 抢票配置类型
export interface GrabConfig {
  platform: string;
  targetUrl: string;
  startTime?: Date;
  buttonSelectors: string[];
  formData?: FormFields;
  retryCount?: number;
  timeout?: number;
}

// 表单字段类型
export interface FormFields {
  inputs: Record<string, string>;
  selects?: Record<string, string>;
  checkboxes?: Record<string, boolean>;
}

// 元素状态类型
export interface ElementState {
  selector: string;
  exists: boolean;
  visible: boolean;
  enabled: boolean;
  text?: string;
}

// 重试策略类型
export interface RetryStrategy {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffFactor: number;
  shouldRetry?: (error: Error, attempt: number) => boolean;
}

// 监控配置类型
export interface MonitorConfig {
  pollInterval: number;
  timeout: number;
  selectors: string[];
  onStateChange?: (state: ElementState) => void;
}

// 日志级别类型
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

// 通知类型
export interface Notification {
  type: 'success' | 'failure' | 'warning';
  message: string;
  timestamp: Date;
}

// 任务状态类型
export type TaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled';

// 任务类型
export interface Task {
  id: string;
  name: string;
  config: GrabConfig;
  status: TaskStatus;
  startTime?: Date;
  endTime?: Date;
  result?: string;
  error?: string;
}

// 平台适配器类型
export interface PlatformAdapter {
  name: string;
  initialize: () => Promise<void>;
  run: () => Promise<boolean>;
  cleanup: () => Promise<void>;
}

// 成功检测函数类型
export type SuccessCondition = (page: Page) => Promise<boolean>;

// 鼠标轨迹点类型
export interface MousePoint {
  x: number;
  y: number;
}

// 配置文件类型
export interface ConfigFile {
  version: string;
  platforms: PlatformConfig[];
}

export interface PlatformConfig {
  name: string;
  url: string;
  loginRequired?: boolean;
  selectors: {
    button: string[];
    input?: Record<string, string>;
    success?: string[];
    failure?: string[];
  };
  formData?: FormFields;
  timing?: {
    startTime?: string;
    refreshInterval?: number;
  };
}

// 导出所有类型
export type {
  BrowserOptions,
  GrabConfig,
  FormFields,
  ElementState,
  RetryStrategy,
  MonitorConfig,
  LogLevel,
  Notification,
  TaskStatus,
  Task,
  PlatformAdapter,
  SuccessCondition,
  MousePoint,
  ConfigFile,
  PlatformConfig,
};