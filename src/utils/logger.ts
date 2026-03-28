/**
 * 日志工具模块
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export interface LogEntry {
  level: LogLevel;
  timestamp: Date;
  message: string;
  context?: string;
}

export class Logger {
  private context: string;
  private level: LogLevel = LogLevel.INFO;

  constructor(context: string) {
    this.context = context;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(message: string): void {
    if (this.level <= LogLevel.DEBUG) {
      this.log(LogLevel.DEBUG, message);
    }
  }

  info(message: string): void {
    if (this.level <= LogLevel.INFO) {
      this.log(LogLevel.INFO, message);
    }
  }

  warn(message: string): void {
    if (this.level <= LogLevel.WARN) {
      this.log(LogLevel.WARN, message);
    }
  }

  error(message: string, error?: Error): void {
    if (this.level <= LogLevel.ERROR) {
      this.log(LogLevel.ERROR, message, error?.message);
    }
  }

  private log(level: LogLevel, message: string, extra?: string): void {
    const colors = {
      DEBUG: '\x1b[36m',  // Cyan
      INFO: '\x1b[32m',   // Green
      WARN: '\x1b[33m',   // Yellow
      ERROR: '\x1b[31m',  // Red
    };

    const reset = '\x1b[0m';
    const timestamp = new Date().toISOString();

    const fullMessage = extra
      ? `${message} - ${extra}`
      : message;

    console.log(
      `${colors[level]}[${level}]${reset} ${timestamp} [${this.context}] ${fullMessage}`
    );
  }
}

export function createLogger(context: string): Logger {
  return new Logger(context);
}

export default Logger;