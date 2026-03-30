/**
 * 任务队列引擎模块
 * 多任务管理和调度
 *
 * 功能清单 (E3):
 * - [x] 实现任务队列数据结构
 * - [x] 实现任务优先级管理
 * - [x] 实现并发任务控制
 * - [x] 实现任务状态追踪
 * - [x] 实现任务持久化
 */

import { createLogger } from './logger.js';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

const logger = createLogger('TaskQueue');

// ==================== 类型定义 ====================

export enum TaskStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum TaskPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
}

export interface TaskConfig {
  /** 任务 ID */
  id?: string;
  /** 任务名称 */
  name: string;
  /** 任务类型 */
  type: string;
  /** 任务参数 */
  params?: Record<string, any>;
  /** 优先级 */
  priority?: TaskPriority;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试延迟 */
  retryDelay?: number;
  /** 依赖任务 ID */
  dependencies?: string[];
  /** 创建时间 */
  createdAt?: Date;
  /** 计划执行时间 */
  scheduledAt?: Date;
  /** 标签 */
  tags?: string[];
  /** 元数据 */
  metadata?: Record<string, any>;
}

export interface TaskResult {
  success: boolean;
  data?: any;
  error?: string;
  duration: number;
  attempts: number;
}

export interface TaskExecution {
  taskId: string;
  startTime: Date;
  endTime?: Date;
  status: TaskStatus;
  result?: TaskResult;
  logs: string[];
}

export class Task {
  id: string;
  name: string;
  type: string;
  params: Record<string, any>;
  priority: TaskPriority;
  status: TaskStatus;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
  dependencies: string[];
  createdAt: Date;
  scheduledAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  tags: string[];
  metadata: Record<string, any>;
  attempts: number;
  logs: string[];

  constructor(config: TaskConfig) {
    this.id = config.id ?? this.generateId();
    this.name = config.name;
    this.type = config.type;
    this.params = config.params ?? {};
    this.priority = config.priority ?? TaskPriority.NORMAL;
    this.status = TaskStatus.PENDING;
    this.timeout = config.timeout ?? 300000; // 5 minutes
    this.maxRetries = config.maxRetries ?? 0;
    this.retryDelay = config.retryDelay ?? 1000;
    this.dependencies = config.dependencies ?? [];
    this.createdAt = config.createdAt ?? new Date();
    this.scheduledAt = config.scheduledAt;
    this.tags = config.tags ?? [];
    this.metadata = config.metadata ?? {};
    this.attempts = 0;
    this.logs = [];
  }

  private generateId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 添加日志
   */
  log(message: string): void {
    this.logs.push(`[${new Date().toISOString()}] ${message}`);
  }

  /**
   * 序列化任务
   */
  toJSON(): object {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      params: this.params,
      priority: this.priority,
      status: this.status,
      timeout: this.timeout,
      maxRetries: this.maxRetries,
      retryDelay: this.retryDelay,
      dependencies: this.dependencies,
      createdAt: this.createdAt.toISOString(),
      scheduledAt: this.scheduledAt?.toISOString(),
      startedAt: this.startedAt?.toISOString(),
      completedAt: this.completedAt?.toISOString(),
      tags: this.tags,
      metadata: this.metadata,
      attempts: this.attempts,
      logs: this.logs,
    };
  }

  /**
   * 从 JSON 创建任务
   */
  static fromJSON(json: any): Task {
    const task = new Task({
      id: json.id,
      name: json.name,
      type: json.type,
      params: json.params,
      priority: json.priority,
      timeout: json.timeout,
      maxRetries: json.maxRetries,
      retryDelay: json.retryDelay,
      dependencies: json.dependencies,
      createdAt: new Date(json.createdAt),
      scheduledAt: json.scheduledAt ? new Date(json.scheduledAt) : undefined,
      tags: json.tags,
      metadata: json.metadata,
    });

    task.status = json.status;
    task.attempts = json.attempts;
    task.logs = json.logs ?? [];

    if (json.startedAt) {
      task.startedAt = new Date(json.startedAt);
    }
    if (json.completedAt) {
      task.completedAt = new Date(json.completedAt);
    }

    return task;
  }
}

// ==================== 任务队列 ====================

export class TaskQueue extends EventEmitter {
  private tasks: Map<string, Task> = new Map();
  private queue: Task[] = [];
  private running: Map<string, Task> = new Map();
  private completed: Map<string, Task> = new Map();
  private concurrency: number;
  private isProcessing: boolean = false;
  private persistencePath?: string;
  private taskHandlers: Map<string, (task: Task) => Promise<TaskResult>> = new Map();

  constructor(options?: {
    concurrency?: number;
    persistencePath?: string;
  }) {
    super();
    this.concurrency = options?.concurrency ?? 1;
    this.persistencePath = options?.persistencePath;

    if (this.persistencePath) {
      this.loadFromPersistence();
    }
  }

  // ==================== 任务注册 ====================

  /**
   * 注册任务处理器
   */
  registerHandler(type: string, handler: (task: Task) => Promise<TaskResult>): void {
    this.taskHandlers.set(type, handler);
    logger.debug(`注册任务处理器: ${type}`);
  }

  /**
   * 注销任务处理器
   */
  unregisterHandler(type: string): void {
    this.taskHandlers.delete(type);
  }

  // ==================== 任务管理 ====================

  /**
   * 添加任务
   */
  addTask(config: TaskConfig): Task {
    const task = new Task(config);
    this.tasks.set(task.id, task);
    this.enqueueTask(task);
    this.saveToPersistence();

    this.emit('task:added', task);
    logger.info(`任务已添加: ${task.name} (${task.id})`);

    return task;
  }

  /**
   * 批量添加任务
   */
  addTasks(configs: TaskConfig[]): Task[] {
    return configs.map(config => this.addTask(config));
  }

  /**
   * 获取任务
   */
  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * 获取所有任务
   */
  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 按状态获取任务
   */
  getTasksByStatus(status: TaskStatus): Task[] {
    return this.getAllTasks().filter(task => task.status === status);
  }

  /**
   * 按优先级获取任务
   */
  getTasksByPriority(priority: TaskPriority): Task[] {
    return this.getAllTasks().filter(task => task.priority === priority);
  }

  /**
   * 更新任务
   */
  updateTask(taskId: string, updates: Partial<TaskConfig>): Task | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;

    Object.assign(task, updates);
    this.saveToPersistence();

    this.emit('task:updated', task);
    return task;
  }

  /**
   * 删除任务
   */
  removeTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    // 从队列中移除
    const queueIndex = this.queue.findIndex(t => t.id === taskId);
    if (queueIndex !== -1) {
      this.queue.splice(queueIndex, 1);
    }

    // 从运行中移除
    this.running.delete(taskId);

    // 从完成列表移除
    this.completed.delete(taskId);

    // 从任务列表移除
    this.tasks.delete(taskId);

    this.saveToPersistence();
    this.emit('task:removed', task);

    logger.info(`任务已删除: ${task.name} (${taskId})`);
    return true;
  }

  /**
   * 清空所有任务
   */
  clear(): void {
    this.tasks.clear();
    this.queue = [];
    this.running.clear();
    this.completed.clear();
    this.saveToPersistence();

    this.emit('queue:cleared');
    logger.info('任务队列已清空');
  }

  // ==================== 队列操作 ====================

  /**
   * 入队任务
   */
  private enqueueTask(task: Task): void {
    task.status = TaskStatus.QUEUED;

    // 按优先级插入（优先级高的在前）
    const insertIndex = this.queue.findIndex(t => t.priority < task.priority);
    if (insertIndex === -1) {
      this.queue.push(task);
    } else {
      this.queue.splice(insertIndex, 0, task);
    }
  }

  /**
   * 出队任务
   */
  private dequeueTask(): Task | undefined {
    return this.queue.shift();
  }

  /**
   * 获取下一个可执行任务
   */
  private getNextExecutableTask(): Task | undefined {
    return this.queue.find(task => this.canExecute(task));
  }

  /**
   * 检查任务是否可执行
   */
  private canExecute(task: Task): boolean {
    // 检查依赖
    for (const depId of task.dependencies) {
      const depTask = this.tasks.get(depId);
      if (!depTask || depTask.status !== TaskStatus.COMPLETED) {
        return false;
      }
    }

    // 检查计划时间
    if (task.scheduledAt && new Date() < task.scheduledAt) {
      return false;
    }

    return true;
  }

  // ==================== 任务执行 ====================

  /**
   * 开始处理队列
   */
  start(): void {
    if (this.isProcessing) return;

    this.isProcessing = true;
    this.emit('queue:started');
    logger.info('任务队列开始处理');

    this.processQueue();
  }

  /**
   * 停止处理队列
   */
  stop(): void {
    this.isProcessing = false;
    this.emit('queue:stopped');
    logger.info('任务队列已停止');
  }

  /**
   * 处理队列
   */
  private async processQueue(): Promise<void> {
    while (this.isProcessing) {
      // 检查并发限制
      if (this.running.size >= this.concurrency) {
        await this.sleep(100);
        continue;
      }

      // 获取下一个任务
      const task = this.getNextExecutableTask();
      if (!task) {
        // 没有可用任务，等待
        await this.sleep(100);
        continue;
      }

      // 从队列移除
      const index = this.queue.indexOf(task);
      if (index !== -1) {
        this.queue.splice(index, 1);
      }

      // 执行任务
      this.executeTask(task);
    }
  }

  /**
   * 执行单个任务
   */
  private async executeTask(task: Task): Promise<void> {
    const handler = this.taskHandlers.get(task.type);

    if (!handler) {
      task.status = TaskStatus.FAILED;
      task.log(`未找到任务处理器: ${task.type}`);
      this.completed.set(task.id, task);
      this.saveToPersistence();

      this.emit('task:failed', task, new Error('未找到任务处理器'));
      return;
    }

    task.status = TaskStatus.RUNNING;
    task.startedAt = new Date();
    task.attempts++;
    this.running.set(task.id, task);

    this.emit('task:started', task);
    logger.info(`任务开始执行: ${task.name} (尝试 ${task.attempts}/${task.maxRetries + 1})`);

    try {
      // 执行任务（带超时）
      const result = await this.withTimeout(
        handler(task),
        task.timeout
      );

      task.status = TaskStatus.COMPLETED;
      task.completedAt = new Date();
      this.completed.set(task.id, task);
      this.saveToPersistence();

      this.emit('task:completed', task, result);
      logger.info(`任务完成: ${task.name}`);

    } catch (error) {
      const err = error as Error;
      task.log(`执行失败: ${err.message}`);

      // 检查是否可以重试
      if (task.attempts <= task.maxRetries) {
        task.status = TaskStatus.QUEUED;

        // 延迟后重新入队
        setTimeout(() => {
          this.enqueueTask(task);
          this.saveToPersistence();
        }, task.retryDelay);

        logger.warn(`任务将重试: ${task.name} (第 ${task.attempts} 次失败)`);
      } else {
        task.status = TaskStatus.FAILED;
        task.completedAt = new Date();
        this.completed.set(task.id, task);
        this.saveToPersistence();

        this.emit('task:failed', task, err);
        logger.error(`任务最终失败: ${task.name}`);
      }
    } finally {
      this.running.delete(task.id);
    }
  }

  /**
   * 暂停任务
   */
  pauseTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== TaskStatus.RUNNING) {
      return false;
    }

    task.status = TaskStatus.PAUSED;
    this.saveToPersistence();
    this.emit('task:paused', task);

    logger.info(`任务已暂停: ${task.name}`);
    return true;
  }

  /**
   * 恢复任务
   */
  resumeTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== TaskStatus.PAUSED) {
      return false;
    }

    task.status = TaskStatus.QUEUED;
    this.enqueueTask(task);
    this.saveToPersistence();
    this.emit('task:resumed', task);

    logger.info(`任务已恢复: ${task.name}`);
    return true;
  }

  /**
   * 取消任务
   */
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    // 只能取消排队中或暂停的任务
    if (task.status !== TaskStatus.QUEUED && task.status !== TaskStatus.PAUSED) {
      return false;
    }

    task.status = TaskStatus.CANCELLED;

    // 从队列移除
    const index = this.queue.findIndex(t => t.id === taskId);
    if (index !== -1) {
      this.queue.splice(index, 1);
    }

    this.saveToPersistence();
    this.emit('task:cancelled', task);

    logger.info(`任务已取消: ${task.name}`);
    return true;
  }

  // ==================== 状态查询 ====================

  /**
   * 获取队列统计
   */
  getStats(): {
    total: number;
    pending: number;
    queued: number;
    running: number;
    completed: number;
    failed: number;
    paused: number;
    cancelled: number;
  } {
    const stats = {
      total: this.tasks.size,
      pending: 0,
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      paused: 0,
      cancelled: 0,
    };

    for (const task of this.tasks.values()) {
      switch (task.status) {
        case TaskStatus.PENDING: stats.pending++; break;
        case TaskStatus.QUEUED: stats.queued++; break;
        case TaskStatus.RUNNING: stats.running++; break;
        case TaskStatus.COMPLETED: stats.completed++; break;
        case TaskStatus.FAILED: stats.failed++; break;
        case TaskStatus.PAUSED: stats.paused++; break;
        case TaskStatus.CANCELLED: stats.cancelled++; break;
      }
    }

    return stats;
  }

  /**
   * 是否为空
   */
  isEmpty(): boolean {
    return this.queue.length === 0 && this.running.size === 0;
  }

  /**
   * 是否正在运行
   */
  isActive(): boolean {
    return this.isProcessing && (this.queue.length > 0 || this.running.size > 0);
  }

  /**
   * 设置并发数
   */
  setConcurrency(n: number): void {
    this.concurrency = Math.max(1, n);
    logger.info(`并发数已设置为: ${this.concurrency}`);
  }

  // ==================== 持久化 ====================

  /**
   * 保存到持久化存储
   */
  private saveToPersistence(): void {
    if (!this.persistencePath) return;

    try {
      const data = {
        tasks: Array.from(this.tasks.values()).map(t => t.toJSON()),
        concurrency: this.concurrency,
        savedAt: new Date().toISOString(),
      };

      const dir = path.dirname(this.persistencePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.persistencePath, JSON.stringify(data, null, 2));
    } catch (error) {
      logger.error(`持久化失败: ${(error as Error).message}`);
    }
  }

  /**
   * 从持久化存储加载
   */
  private loadFromPersistence(): void {
    if (!this.persistencePath || !fs.existsSync(this.persistencePath)) {
      return;
    }

    try {
      const content = fs.readFileSync(this.persistencePath, 'utf-8');
      const data = JSON.parse(content);

      this.concurrency = data.concurrency ?? 1;

      for (const taskJson of data.tasks ?? []) {
        const task = Task.fromJSON(taskJson);
        this.tasks.set(task.id, task);

        // 根据状态重新入队
        if (task.status === TaskStatus.QUEUED || task.status === TaskStatus.PENDING) {
          this.enqueueTask(task);
        } else if (task.status === TaskStatus.RUNNING) {
          // 运行中的任务需要重新执行
          task.status = TaskStatus.QUEUED;
          this.enqueueTask(task);
        } else if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.FAILED) {
          this.completed.set(task.id, task);
        }
      }

      logger.info(`从持久化存储加载了 ${this.tasks.size} 个任务`);
    } catch (error) {
      logger.error(`加载持久化数据失败: ${(error as Error).message}`);
    }
  }

  // ==================== 工具方法 ====================

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`任务超时: ${timeout}ms`)), timeout)
      ),
    ]);
  }
}

export default TaskQueue;