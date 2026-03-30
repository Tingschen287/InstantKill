# InstantKill - 智能抢票系统

一个基于 Playwright 的智能抢票/抢套餐工具

## 特性

- 🎯 **仿人操作**：模拟真实用户行为，- 🛡️ **高效率**：毫秒级响应
- 🔧 **多平台支持**：配置驱动适配
- 🔄 **稳定可靠**：智能重试机制

## 快速开始

```bash
# 安装依赖
npm install

# 运行测试
npm run test:all

# 启动 CLI
npm run cli --help

# 创建配置文件
cp configs/example.yaml configs/my-platform.yaml
# 编辑配置
nano configs/my-platform.yaml
```

## 项目结构

```
InstantKill/
├── src/
│   ├── index.ts           # 入口文件
│   ├── cli.ts             # CLI 入口
│   ├── engine/
│   │   ├── browser.ts     # 浏览器控制
│   │   ├── anti-detect.ts # 反检测机制
│   │   ├── monitor.ts     # 页面监控
│   │   ├── retry.ts       # 重试机制
│   │   └── queue.ts       # 任务队列
│   ├── strategies/
│   │   ├── refresh.ts     # 刷新策略
│   │   ├── click.ts       # 点击策略
│   │   └── fill.ts        # 表单填充
│   ├── adapters/
│   │   ├── base.ts        # 基础适配器
│   │   └── config.ts      # 配置适配器
│   └── utils/
│       └── logger.ts      # 日志工具
├── configs/
│   └── example.yaml       # 示例配置
├── tests/
│   └── test-*.ts          # 测试文件
└── README.md
```

## 模块说明

### A. 核心引擎模块
| 模块 | 功能 | 状态 |
|------|------|------|
| A1 | 浏览器自动化基础 | ✅ |
| A2 | 反检测机制 | ✅ |
| A3 | 页面监控 | ✅ |
| A4 | 自动重试机制 | ✅ |

### B. 抢票策略模块
| 模块 | 功能 | 状态 |
|------|------|------|
| B1 | 定时刷新 | ✅ |
| B2 | 按钮状态监听 | ✅ |
| B3 | 快速点击 | ✅ |
| B4 | 表单自动填充 | ✅ |

### C. 平台适配模块
| 模块 | 功能 | 状态 |
|------|------|------|
| C1 | 通用适配器 | ✅ |
| C2 | 自定义脚本 | ✅ |
| C3 | 配置管理 | ✅ |

### D. 监控与日志
| 模块 | 功能 | 状态 |
|------|------|------|
| D1 | 实时日志 | ✅ |
| D2 | 截图记录 | ✅ |
| D3 | 结果通知 | ✅ |

### E. 用户界面
| 模块 | 功能 | 状态 |
|------|------|------|
| E1 | CLI 命令行 | ✅ |
| E2 | 配置文件 | ✅ |
| E3 | 任务队列 | ✅ |

## CLI 命令

```bash
# 运行抢票任务
instantkill run [platform] -c ./configs/platform.yaml

# 配置管理
instantkill config init     # 初始化配置
instantkill config validate # 验证配置
instantkill config encrypt   # 加密配置

# 测试模块
instantkill test browser
instantkill test click
instantkill test fill

# 任务管理
instantkill task list
instantkill task add --name "任务名" --priority high
```

## 配置文件示例

```yaml
version: "1.0"

platforms:
  - name: "示例平台"
    url: "https://example.com/tickets"
    selectors:
      button:
        - "#buy-button"
        - ".ticket-buy-btn"
      success:
        - ".order-success"
    formData:
      inputs:
        name: "张三"
        phone: "13800138000"
    timing:
      startTime: "2026-04-01 10:00:00"
      refreshInterval: 500

global:
  headless: false
  humanMode: true
  maxRetries: 5
```

## 许可证

MIT License
