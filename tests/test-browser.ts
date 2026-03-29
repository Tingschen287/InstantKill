/**
 * 浏览器自动化功能测试脚本
 * 用于验证 A1: 浏览器自动化基础
 */

import { BrowserEngine } from './src/engine/browser.js';
import { createLogger } from './src/utils/logger.js';

const logger = createLogger('A1-Test');

async function testBrowserAutomation(): Promise<void> {
  const browser = new BrowserEngine();
  let passedTests = 0;
  let totalTests = 0;

  try {
    // 测试 1: 启动浏览器
    logger.info('测试 1: 启动浏览器');
    totalTests++;
    await browser.launch({ headless: false, slowMo: 50 });
    logger.info('✅ 浏览器启动成功');
    passedTests++;

    // 测试 2: 创建上下文
    logger.info('测试 2: 创建浏览器上下文');
    totalTests++;
    await browser.createContext({
      viewport: { width: 1920, height: 1080 },
      locale: 'zh-CN',
    });
    logger.info('✅ 上下文创建成功');
    passedTests++;

    // 测试 3: 创建新页面
    logger.info('测试 3: 创建新页面');
    totalTests++;
    await browser.newPage('main');
    logger.info('✅ 页面创建成功');
    passedTests++;

    // 测试 4: 导航到网页
    logger.info('测试 4: 导航到示例网页');
    totalTests++;
    await browser.navigate('https://example.com', {
      waitUntil: 'domcontentloaded',
      timeout: 10000,
    });
    logger.info('✅ 导航成功');
    passedTests++;

    // 测试 5: 获取页面信息
    logger.info('测试 5: 获取页面信息');
    totalTests++;
    const title = await browser.getTitle();
    const url = browser.getCurrentUrl();
    logger.info(`页面标题: ${title}`);
    logger.info(`当前 URL: ${url}`);
    if (title && url) {
      logger.info('✅ 页面信息获取成功');
      passedTests++;
    } else {
      logger.error('❌ 页面信息获取失败');
    }

    // 测试 6: 元素操作 - 查询元素
    logger.info('测试 6: 查询页面元素');
    totalTests++;
    const h1Exists = await browser.elementExists('h1');
    const h1Info = await browser.getElementInfo('h1');
    logger.info(`h1 元素存在: ${h1Exists}`);
    logger.info(`h1 文本: ${h1Info.text}`);
    if (h1Exists && h1Info.text) {
      logger.info('✅ 元素查询成功');
      passedTests++;
    } else {
      logger.error('❌ 元素查询失败');
    }

    // 测试 7: 截图功能
    logger.info('测试 7: 页面截图');
    totalTests++;
    await browser.screenshot('./screenshots/test-screenshot.png');
    logger.info('✅ 截图保存成功');
    passedTests++;

    // 测试 8: Cookie 管理
    logger.info('测试 8: Cookie 管理');
    totalTests++;
    const cookies = await browser.getCookies();
    logger.info(`获取到 ${cookies.length} 个 Cookie`);
    await browser.setCookies([
      {
        name: 'test_cookie',
        value: 'test_value',
        domain: 'example.com',
        path: '/',
      },
    ]);
    const newCookies = await browser.getCookies();
    if (newCookies.length > cookies.length) {
      logger.info('✅ Cookie 设置成功');
      passedTests++;
    } else {
      logger.error('❌ Cookie 设置失败');
    }

    // 测试 9: 执行 JavaScript
    logger.info('测试 9: 执行 JavaScript');
    totalTests++;
    const result = await browser.evaluate('document.title');
    logger.info(`执行结果: ${result}`);
    if (result) {
      logger.info('✅ JavaScript 执行成功');
      passedTests++;
    } else {
      logger.error('❌ JavaScript 执行失败');
    }

    // 测试 10: 页面刷新
    logger.info('测试 10: 页面刷新');
    totalTests++;
    await browser.refresh();
    logger.info('✅ 页面刷新成功');
    passedTests++;

    // 测试 11: 等待元素
    logger.info('测试 11: 等待元素');
    totalTests++;
    await browser.waitForSelector('h1', { timeout: 5000 });
    logger.info('✅ 等待元素成功');
    passedTests++;

    // 测试 12: 关闭浏览器
    logger.info('测试 12: 关闭浏览器');
    totalTests++;
    await browser.close();
    logger.info('✅ 浏览器关闭成功');
    passedTests++;

  } catch (error) {
    logger.error(`测试失败: ${error}`);
    // 确保浏览器被关闭
    await browser.close();
  }

  // 输出测试结果
  logger.info('');
  logger.info('====================');
  logger.info('测试结果汇总');
  logger.info('====================');
  logger.info(`总测试数: ${totalTests}`);
  logger.info(`通过测试: ${passedTests}`);
  logger.info(`失败测试: ${totalTests - passedTests}`);
  logger.info(`通过率: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  logger.info('====================');

  if (passedTests === totalTests) {
    logger.info('✅ 所有测试通过！');
  } else {
    logger.error('❌ 部分测试失败');
    process.exit(1);
  }
}

// 运行测试
(async () => {
  logger.info('开始测试 A1: 浏览器自动化基础');
  logger.info('');
  await testBrowserAutomation();
})();
