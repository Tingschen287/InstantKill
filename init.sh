#!/bin/bash

# InstantKill - 环境启动脚本
# 按照 Anthropic 长时间运行 Agent 方法论设计

set -e

echo "======================================"
echo "InstantKill - 智能抢票系统"
echo "======================================"
echo ""

# 1. 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先安装 Node.js"
    exit 1
fi

echo "✅ Node.js 版本: $(node --version)"
echo "✅ npm 版本: $(npm --version)"
echo ""

# 2. 检查依赖是否已安装
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
else
    echo "✅ 依赖已安装"
fi

echo ""

# 3. 检查 Playwright 浏览器
if ! npx playwright --version &> /dev/null; then
    echo "❌ Playwright 未安装"
    exit 1
fi

echo "✅ Playwright 版本: $(npx playwright --version)"
echo ""

# 4. 验证配置文件存在
REQUIRED_FILES=("feature_list.json" "claude-progress.txt")
for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo "❌ 缺少必需文件: $file"
        exit 1
    fi
    echo "✅ 找到配置文件: $file"
done

echo ""

# 5. 显示当前工作目录
echo "📁 当前工作目录: $(pwd)"
echo ""

# 6. 显示功能完成状态
echo "📊 功能完成状态:"
if command -v jq &> /dev/null; then
    PASSING=$(jq '[.features[] | select(.passes == true)] | length' feature_list.json)
    TOTAL=$(jq '.features | length' feature_list.json)
    echo "   已完成: $PASSING / $TOTAL"
else
    echo "   (安装 jq 以查看详细统计)"
fi

echo ""
echo "======================================"
echo "✅ 环境检查完成！"
echo "======================================"
echo ""
echo "可用命令:"
echo "  npm run dev    - 开发模式（热重载）"
echo "  npm run build  - 构建项目"
echo "  npm start      - 运行构建后的代码"
echo ""
