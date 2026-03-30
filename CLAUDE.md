# InstantKill - Claude Code 指南

## 项目概述

InstantKill 是一个基于 Playwright 的智能抢票/抢套餐工具，核心目标是：
- **仿人操作**：模拟真实用户行为，避免被检测为机器人
- **高效率**：毫秒级响应，比手动操作更快
- **多平台支持**：通过配置适配不同抢票平台
- **稳定可靠**：智能重试、异常处理、监控通知

## 技术栈

- **语言**: TypeScript (ES Modules)
- **运行时**: Node.js
- **浏览器自动化**: Playwright
- **CLI**: Commander.js + Inquirer + Chalk

## 项目结构

```
src/
├── cli.ts                 # CLI 入口点
├── index.ts               # 主入口，导出 CLI 类
├── engine/                # 核心引擎模块
│   ├── browser.ts         # A1: 浏览器控制
│   ├── anti-detect.ts     # A2: 反检测机制
│   ├── monitor.ts         # A3: 页面监控
│   ├── retry.ts           # A4: 重试机制
│   └── queue.ts           # E3: 任务队列
├── strategies/            # 抢票策略模块
│   ├── refresh.ts         # B1: 定时刷新
│   ├── click.ts           # B2-B3: 按钮监听与快速点击
│   └── fill.ts            # B4: 表单自动填充
├── adapters/              # 平台适配模块
│   ├── base.ts            # C1, C3: 基础适配器、配置管理
│   └── config.ts          # C2: 自定义脚本执行
├── utils/                 # 工具函数
│   ├── logger.ts          # D1-D3: 日志、截图、通知
│   ├── random.ts          # 随机化工具
│   └── time.ts            # 时间工具
└── types/                 # 类型定义
    └── index.ts
```

## 模块说明

### A. 核心引擎 (engine/)

| 文件 | 模块 | 主要类/函数 |
|------|------|-------------|
| browser.ts | A1 | BrowserController, LaunchOptions |
| anti-detect.ts | A2 | AntiDetectManager, MouseTrajectory |
| monitor.ts | A3 | PageMonitor, NetworkInterceptor |
| retry.ts | A4 | RetryManager, RetryStrategy |
| queue.ts | E3 | TaskQueue, Task |

### B. 抢票策略 (strategies/)

| 文件 | 模块 | 主要类/函数 |
|------|------|-------------|
| refresh.ts | B1 | RefreshStrategy, HighPrecisionTimer |
| click.ts | B2-B3 | ButtonStateMonitor, ClickStrategy |
| fill.ts | B4 | FillStrategy, FormFieldRecognizer |

### C. 平台适配 (adapters/)

| 文件 | 模块 | 主要类/函数 |
|------|------|-------------|
| base.ts | C1, C3 | BaseAdapter, ConfigLoader, ConfigEncryptor |
| config.ts | C2 | ConfigAdapter, ScriptExecutor |

### D. 监控日志 (utils/logger.ts)

| 模块 | 主要类 |
|------|--------|
| D1 | LogManager |
| D2 | ScreenshotManager |
| D3 | NotificationManager |

### E. 用户界面 (index.ts, cli.ts)

| 模块 | 位置 |
|------|------|
| E1 | InstantKillCLI (index.ts) |
| E2 | configs/*.yaml |
| E3 | TaskQueue (engine/queue.ts) |

## 开发指南

### 构建和运行

```bash
# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 构建
npm run build

# 运行 CLI
npm run cli --help
npm run cli run --platform example -c ./configs/example.yaml
```

### 测试

```bash
# 运行所有测试
npm run test:all

# 单独测试各模块
npm run test:browser      # A1
npm run test:anti-detect  # A2
npm run test:monitor      # A3
npm run test:retry        # A4
npm run test:refresh      # B1
npm run test:click        # B2-B3
npm run test:fill         # B4
npm run test:adapter      # C1-C3
```

### 添加新功能

1. 在对应目录创建/编辑文件
2. 导出必要的类和函数
3. 在 `src/types/index.ts` 中添加类型定义（如需要）
4. 编写对应的测试文件 `tests/test-*.ts`
5. 更新 package.json 的 test scripts（如需要）

## 代码规范

### 导入顺序

1. Node.js 内置模块
2. 外部依赖 (playwright, commander 等)
3. 内部模块（使用 `./` 相对路径）

### 使用 ES Modules

- 所有 import 必须包含 `.js` 扩展名
- package.json 中 `"type": "module"`
- tsconfig.json 中 `"module": "NodeNext"`

### 命名约定

- 类名: PascalCase (例: `BrowserController`)
- 函数/方法: camelCase (例: `launchBrowser`)
- 常量: UPPER_SNAKE_CASE (例: `MAX_RETRIES`)
- 接口/类型: PascalCase (例: `LaunchOptions`)

### 异步处理

- 所有异步函数返回 `Promise<T>`
- 使用 async/await 而非 Promise 链
- 错误通过 try-catch 或 .catch() 处理

### 日志

使用 `createLogger` 创建带上下文的日志器：

```typescript
import { createLogger } from './utils/logger.js';

const logger = createLogger('ModuleName');
logger.info('信息消息');
logger.error('错误消息');
logger.debug('调试消息');
```

## 配置文件

配置使用 YAML 格式，位于 `configs/` 目录：

```yaml
version: "1.0"

platforms:
  - name: "平台名称"
    url: "https://example.com"
    selectors:
      button: ["#buy-btn"]
      success: [".success"]

global:
  headless: false
  humanMode: true
  maxRetries: 5
```

## Git 提交规范

```
<type>: <subject>

类型:
- feat: 新功能
- fix: 修复
- docs: 文档
- refactor: 重构
- test: 测试
- chore: 构建/工具
```

## 重要提示

1. **不要修改已通过的测试**：除非有充分的理由
2. **保持向后兼容**：配置格式应保持稳定
3. **安全性**：敏感信息使用 ConfigEncryptor 加密
4. **性能**：抢票场景下，每毫秒都很重要
