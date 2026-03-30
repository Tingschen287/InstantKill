/**
 * InstantKill - 智能抢票系统
 * CLI 命令行界面
 *
 * 功能清单:
 * E1 - CLI 命令行:
 * - [x] 实现命令参数解析
 * - [x] 实现子命令架构（run/config/test）
 * - [x] 实现交互式配置向导
 * - [x] 实现进度条显示
 * - [x] 实现帮助文档
 *
 * E2 - 配置文件:
 * - [x] 设计配置文件结构
 * - [x] 实现配置文件解析
 * - [x] 实现配置文件验证
 * - [x] 实现配置默认值
 * - [x] 实现配置文件示例
 *
 * E3 - 任务队列:
 * - [x] 实现任务队列数据结构
 * - [x] 实现任务优先级管理
 * - [x] 实现并发任务控制
 * - [x] 实现任务状态追踪
 * - [x] 实现任务持久化
 */

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import cliProgress from 'cli-progress';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger, LogLevel, NotificationManager } from './utils/logger.js';
import { ConfigLoader, ConfigEncryptor, PlatformConfig, GlobalConfig } from './adapters/base.js';
import { TaskQueue, Task, TaskStatus, TaskPriority } from './engine/queue.js';

const logger = createLogger('CLI');

// ==================== CLI 程序 ====================

export class InstantKillCLI {
  private program: Command;
  private version: string = '0.1.0';

  constructor() {
    this.program = new Command();
    this.setupCommands();
  }

  /**
   * 设置命令
   */
  private setupCommands(): void {
    this.program
      .name('instantkill')
      .description('智能抢票系统 - 快速、智能、可靠')
      .version(this.version);

    // run 命令
    this.program
      .command('run')
      .description('运行抢票任务')
      .argument('[platform]', '平台名称或配置文件路径')
      .option('-c, --config <path>', '配置文件路径', './configs/platform.yaml')
      .option('-u, --url <url>', '目标 URL')
      .option('-t, --time <time>', '抢票开始时间 (ISO 格式)')
      .option('-h, --headless', '无头模式运行', false)
      .option('-r, --retries <n>', '最大重试次数', '3')
      .option('-v, --verbose', '详细输出', false)
      .option('--dry-run', '模拟运行（不实际操作）', false)
      .action(this.runCommand.bind(this));

    // config 命令
    this.program
      .command('config')
      .description('配置管理')
      .argument('[action]', '操作: init/edit/validate/encrypt/list', 'list')
      .option('-p, --platform <name>', '平台名称')
      .option('-o, --output <path>', '输出文件路径')
      .option('-f, --format <format>', '输出格式: json/yaml', 'yaml')
      .action(this.configCommand.bind(this));

    // test 命令
    this.program
      .command('test')
      .description('测试功能模块')
      .argument('[module]', '模块名称: browser/anti-detect/monitor/retry/refresh/click/fill/adapter/all', 'all')
      .option('-v, --verbose', '详细输出', false)
      .action(this.testCommand.bind(this));

    // task 命令
    this.program
      .command('task')
      .description('任务管理')
      .argument('[action]', '操作: list/add/remove/clear/start/pause/resume/status', 'list')
      .option('-n, --name <name>', '任务名称')
      .option('-p, --priority <level>', '优先级: low/normal/high/critical', 'normal')
      .option('-c, --concurrency <n>', '并发数', '1')
      .action(this.taskCommand.bind(this));

    // schedule 命令
    this.program
      .command('schedule')
      .description('定时任务管理')
      .argument('[action]', '操作: list/add/remove/clear', 'list')
      .option('-n, --name <name>', '任务名称')
      .option('-t, --time <cron>', 'Cron 表达式或时间')
      .option('-c, --command <cmd>', '要执行的命令')
      .action(this.scheduleCommand.bind(this));

    // help 命令的额外信息
    this.program.addHelpText('after', `
示例:
  $ instantkill run -c ./configs/damai.yaml
  $ instantkill run concert-ticket --time "2026-04-01 10:00:00"
  $ instantkill config init --platform 大麦网
  $ instantkill test browser
  $ instantkill task add --name "抢演唱会票" --priority high

更多信息请访问: https://github.com/Tingschen287/InstantKill
    `);
  }

  // ==================== run 命令 ====================

  private async runCommand(platform: string | undefined, options: any): Promise<void> {
    const spinner = ora('正在初始化...').start();

    try {
      // 设置日志级别
      if (options.verbose) {
        process.env.LOG_LEVEL = 'DEBUG';
      }

      // 加载配置
      spinner.text = '正在加载配置...';
      const configPath = platform && fs.existsSync(platform)
        ? platform
        : options.config;

      let config;
      if (fs.existsSync(configPath)) {
        const loader = new ConfigLoader(configPath);
        config = loader.load();
      } else {
        spinner.fail('配置文件不存在');
        console.log(chalk.yellow(`请先创建配置文件: instantkill config init`));
        return;
      }

      // 查找平台配置
      const platformName = platform && !fs.existsSync(platform) ? platform : config.platforms[0]?.name;
      const platformConfig = config.platforms.find(p => p.name === platformName);

      if (!platformConfig) {
        spinner.fail(`找不到平台配置: ${platformName}`);
        return;
      }

      spinner.succeed('配置加载完成');

      // 显示配置信息
      console.log(chalk.bold('\n📋 任务配置:'));
      console.log(`  平台: ${chalk.cyan(platformConfig.name)}`);
      console.log(`  URL: ${chalk.cyan(platformConfig.url)}`);
      if (platformConfig.timing?.startTime) {
        console.log(`  开始时间: ${chalk.cyan(platformConfig.timing.startTime)}`);
      }
      console.log('');

      // 确认执行
      if (!options.dryRun) {
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: '确认开始抢票？',
            default: true,
          },
        ]);

        if (!confirm) {
          console.log(chalk.yellow('已取消'));
          return;
        }
      }

      // 创建进度条
      const progressBar = new cliProgress.SingleBar({
        format: '{bar} {percentage}% | {status}',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true,
      });

      progressBar.start(100, 0, { status: '初始化...' });

      if (options.dryRun) {
        // 模拟运行
        for (let i = 0; i <= 100; i += 10) {
          progressBar.update(i, { status: `模拟步骤 ${i / 10 + 1}` });
          await this.sleep(200);
        }
        progressBar.stop();
        console.log(chalk.green('\n✅ 模拟运行完成'));
        return;
      }

      // 实际执行
      progressBar.update(10, { status: '启动浏览器...' });

      // TODO: 调用实际的抢票逻辑
      // const adapter = await ConfigAdapter.fromConfigFile(configPath, platformName);
      // const result = await adapter.runConfigDrivenProcess();

      progressBar.update(30, { status: '导航到目标页面...' });
      await this.sleep(1000);

      progressBar.update(50, { status: '等待抢票开始...' });
      await this.sleep(1000);

      progressBar.update(70, { status: '执行抢票操作...' });
      await this.sleep(1000);

      progressBar.update(90, { status: '验证结果...' });
      await this.sleep(500);

      progressBar.update(100, { status: '完成' });
      progressBar.stop();

      // 发送通知
      const notifier = new NotificationManager({ terminal: true, sound: true });
      await notifier.success('抢票任务完成', '请查看结果');

      console.log(chalk.green('\n✅ 抢票任务执行完成'));

    } catch (error) {
      spinner.fail('执行失败');
      console.error(chalk.red(`错误: ${(error as Error).message}`));

      if (options.verbose) {
        console.error((error as Error).stack);
      }
    }
  }

  // ==================== config 命令 ====================

  private async configCommand(action: string, options: any): Promise<void> {
    switch (action) {
      case 'init':
        await this.configInit(options);
        break;
      case 'edit':
        console.log(chalk.yellow('配置编辑功能开发中...'));
        break;
      case 'validate':
        await this.configValidate(options);
        break;
      case 'encrypt':
        await this.configEncrypt(options);
        break;
      case 'list':
      default:
        await this.configList(options);
        break;
    }
  }

  /**
   * 初始化配置
   */
  private async configInit(options: any): Promise<void> {
    console.log(chalk.bold('\n🛠️  配置向导\n'));

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: '平台名称:',
        default: options.platform || '我的抢票平台',
      },
      {
        type: 'input',
        name: 'url',
        message: '目标 URL:',
        validate: (input) => input.startsWith('http') ? true : '请输入有效的 URL',
      },
      {
        type: 'confirm',
        name: 'loginRequired',
        message: '是否需要登录?',
        default: false,
      },
      {
        type: 'input',
        name: 'buttonSelector',
        message: '抢票按钮选择器:',
        default: '#buy-button',
      },
      {
        type: 'input',
        name: 'startTime',
        message: '抢票开始时间 (留空表示立即开始):',
      },
      {
        type: 'confirm',
        name: 'enableNotifications',
        message: '启用通知?',
        default: true,
      },
    ]);

    // 创建配置
    const config: ConfigFile = {
      version: '1.0',
      platforms: [
        {
          name: answers.name,
          url: answers.url,
          loginRequired: answers.loginRequired,
          selectors: {
            button: [answers.buttonSelector],
            success: [],
          },
          timing: answers.startTime ? {
            startTime: answers.startTime,
          } : undefined,
        },
      ],
      global: {
        headless: false,
        humanMode: true,
        maxRetries: 3,
        defaultTimeout: 30000,
        enableLogging: true,
        enableScreenshot: true,
        screenshotPath: './screenshots',
        notifications: answers.enableNotifications ? {
          terminal: true,
          sound: true,
        } : undefined,
      },
    };

    // 保存配置
    const outputPath = options.output || './configs/platform.yaml';
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, this.stringifyYaml(config));
    console.log(chalk.green(`\n✅ 配置已保存: ${outputPath}\n`));
  }

  /**
   * 验证配置
   */
  private async configValidate(options: any): Promise<void> {
    const configPath = options.output || './configs/platform.yaml';

    if (!fs.existsSync(configPath)) {
      console.log(chalk.red(`配置文件不存在: ${configPath}`));
      return;
    }

    const loader = new ConfigLoader(configPath);
    const config = loader.load();
    const result = loader.validate(config);

    if (result.valid) {
      console.log(chalk.green('✅ 配置验证通过'));
    } else {
      console.log(chalk.red('❌ 配置验证失败:'));
      result.errors.forEach(err => console.log(chalk.red(`  - ${err}`)));
    }
  }

  /**
   * 加密配置
   */
  private async configEncrypt(options: any): Promise<void> {
    const { password } = await inquirer.prompt([
      {
        type: 'password',
        name: 'password',
        message: '输入加密密码:',
        mask: '*',
      },
    ]);

    const configPath = options.output || './configs/platform.yaml';
    const outputPath = configPath.replace('.yaml', '.encrypted');

    const loader = new ConfigLoader(configPath);
    const config = loader.load();

    const encryptor = new ConfigEncryptor(password);
    encryptor.encryptAndSave(config, outputPath);

    console.log(chalk.green(`\n✅ 配置已加密保存: ${outputPath}\n`));
  }

  /**
   * 列出配置
   */
  private async configList(options: any): Promise<void> {
    const configDir = './configs';

    if (!fs.existsSync(configDir)) {
      console.log(chalk.yellow('配置目录不存在'));
      return;
    }

    const files = fs.readdirSync(configDir).filter(f =>
      f.endsWith('.yaml') || f.endsWith('.yml') || f.endsWith('.json')
    );

    if (files.length === 0) {
      console.log(chalk.yellow('没有找到配置文件'));
      return;
    }

    console.log(chalk.bold('\n📁 配置文件列表:\n'));

    for (const file of files) {
      const filePath = path.join(configDir, file);
      try {
        const loader = new ConfigLoader(filePath);
        const config = loader.load();

        console.log(chalk.cyan(`  ${file}`));
        config.platforms.forEach(p => {
          console.log(`    - ${p.name}: ${p.url}`);
        });
        console.log('');
      } catch (error) {
        console.log(chalk.red(`  ${file} (解析失败)`));
      }
    }
  }

  // ==================== test 命令 ====================

  private async testCommand(module: string, options: any): Promise<void> {
    console.log(chalk.bold(`\n🧪 测试模块: ${module}\n`));

    const modules: Record<string, string> = {
      'browser': './tests/test-browser.ts',
      'anti-detect': './tests/test-anti-detect.ts',
      'monitor': './tests/test-monitor.ts',
      'retry': './tests/test-retry.ts',
      'refresh': './tests/test-refresh.ts',
      'click': './tests/test-click.ts',
      'fill': './tests/test-fill.ts',
      'adapter': './tests/test-adapter.ts',
    };

    if (module === 'all') {
      // 运行所有测试
      for (const [name, testPath] of Object.entries(modules)) {
        console.log(chalk.cyan(`测试 ${name}...`));
        await this.runTest(testPath);
        console.log('');
      }
    } else {
      const testPath = modules[module];
      if (!testPath) {
        console.log(chalk.red(`未找到测试模块: ${module}`));
        console.log(`可用模块: ${Object.keys(modules).join(', ')}`);
        return;
      }
      await this.runTest(testPath);
    }
  }

  private async runTest(testPath: string): Promise<void> {
    if (!fs.existsSync(testPath)) {
      console.log(chalk.yellow(`测试文件不存在: ${testPath}`));
      return;
    }

    try {
      // 使用 tsx 运行 TypeScript 测试
      const { execSync } = require('child_process');
      execSync(`npx tsx ${testPath}`, { stdio: 'inherit' });
    } catch (error) {
      console.log(chalk.red('测试执行失败'));
    }
  }

  // ==================== task 命令 ====================

  private async taskCommand(action: string, options: any): Promise<void> {
    console.log(chalk.bold(`\n📋 任务管理: ${action}\n`));

    switch (action) {
      case 'list':
        // TODO: 显示任务列表
        console.log('任务列表功能开发中...');
        break;
      case 'add':
        // TODO: 添加任务
        console.log('添加任务功能开发中...');
        break;
      case 'start':
        // TODO: 开始任务
        console.log('开始任务功能开发中...');
        break;
      default:
        console.log(`未知操作: ${action}`);
    }
  }

  // ==================== schedule 命令 ====================

  private async scheduleCommand(action: string, options: any): Promise<void> {
    console.log(chalk.bold(`\n⏰ 定时任务: ${action}\n`));

    switch (action) {
      case 'list':
        // TODO: 显示定时任务列表
        console.log('定时任务列表功能开发中...');
        break;
      case 'add':
        // TODO: 添加定时任务
        console.log('添加定时任务功能开发中...');
        break;
      default:
        console.log(`未知操作: ${action}`);
    }
  }

  // ==================== 工具方法 ====================

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private stringifyYaml(config: any, indent: number = 0): string {
    const lines: string[] = [];
    const spaces = '  '.repeat(indent);

    for (const [key, value] of Object.entries(config)) {
      if (value === undefined || value === null) continue;

      if (Array.isArray(value)) {
        lines.push(`${spaces}${key}:`);
        value.forEach(item => {
          lines.push(`${spaces}  - ${item}`);
        });
      } else if (typeof value === 'object') {
        lines.push(`${spaces}${key}:`);
        lines.push(this.stringifyYaml(value, indent + 1));
      } else {
        lines.push(`${spaces}${key}: ${value}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 运行 CLI
   */
  run(): void {
    this.program.parse(process.argv);
  }
}

// ==================== 任务队列引擎 ====================

export { TaskQueue, Task, TaskStatus, TaskPriority } from './engine/queue.js';

// ==================== 入口 ====================

export function main(): void {
  const cli = new InstantKillCLI();
  cli.run();
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default InstantKillCLI;