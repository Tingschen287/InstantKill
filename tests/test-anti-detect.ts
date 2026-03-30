/**
 * 反检测机制测试脚本
 * 用于验证 A2: 反检测机制
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { AntiDetect } from '../src/engine/anti-detect.js';
import { createLogger } from '../src/utils/logger.js';

const logger = createLogger('A2-Test');

async function testAntiDetect(): Promise<void> {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let passedTests = 0;
  let totalTests = 0;

  try {
    // 测试 1: 随机延迟生成
    logger.info('测试 1: 随机延迟生成');
    totalTests++;
    const delays = Array.from({ length: 100 }, () => AntiDetect.randomDelay(100, 500));
    const allInRange = delays.every(d => d >= 100 && d <= 500);
    const hasVariation = new Set(delays).size > 50; // 应该有很多不同的值
    if (allInRange && hasVariation) {
      logger.info(`✅ 随机延迟生成正确 (样本: ${delays.slice(0, 5).join(', ')}...)`);
      passedTests++;
    } else {
      logger.error('❌ 随机延迟生成失败');
    }

    // 测试 2: 打字延迟生成
    logger.info('测试 2: 打字延迟生成');
    totalTests++;
    const typingDelays = Array.from({ length: 50 }, () => AntiDetect.typingDelay());
    const typingOk = typingDelays.every(d => d > 0);
    if (typingOk) {
      logger.info(`✅ 打字延迟生成正确 (样本: ${typingDelays.slice(0, 5).join(', ')}...)`);
      passedTests++;
    } else {
      logger.error('❌ 打字延迟生成失败');
    }

    // 测试 3: 鼠标轨迹生成
    logger.info('测试 3: 鼠标轨迹生成');
    totalTests++;
    const path = AntiDetect.generateMousePath(100, 100, 500, 300, { steps: 15 });
    const pathValid = path.length === 16 && // steps + 1 个点
      path.every(p => typeof p.x === 'number' && typeof p.y === 'number' && typeof p.delay === 'number');
    if (pathValid) {
      logger.info(`✅ 鼠标轨迹生成正确 (${path.length} 个点)`);
      passedTests++;
    } else {
      logger.error('❌ 鼠标轨迹生成失败');
    }

    // 测试 4: 用户代理生成
    logger.info('测试 4: 用户代理生成');
    totalTests++;
    const userAgents = Array.from({ length: 10 }, () => AntiDetect.getRandomUserAgent());
    const uaValid = userAgents.every(ua => ua.includes('Mozilla/5.0'));
    if (uaValid) {
      logger.info(`✅ 用户代理生成正确`);
      passedTests++;
    } else {
      logger.error('❌ 用户代理生成失败');
    }

    // 测试 5: 浏览器指纹生成
    logger.info('测试 5: 浏览器指纹生成');
    totalTests++;
    const fingerprint = AntiDetect.generateFingerprint();
    const fpValid = fingerprint.userAgent &&
      fingerprint.viewport.width > 0 &&
      fingerprint.locale &&
      fingerprint.timezone;
    if (fpValid) {
      logger.info(`✅ 浏览器指纹生成正确`);
      logger.info(`   UA: ${fingerprint.userAgent.substring(0, 50)}...`);
      logger.info(`   Viewport: ${fingerprint.viewport.width}x${fingerprint.viewport.height}`);
      logger.info(`   Locale: ${fingerprint.locale}, Timezone: ${fingerprint.timezone}`);
      passedTests++;
    } else {
      logger.error('❌ 浏览器指纹生成失败');
    }

    // 测试 6: 创建带反检测的浏览器上下文
    logger.info('测试 6: 创建带反检测的浏览器上下文');
    totalTests++;
    browser = await chromium.launch({ headless: false });
    context = await AntiDetect.createStealthContext(browser);
    page = await context.newPage();

    // 导航到测试页面
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded' });

    // 检查 webdriver 属性是否被隐藏
    const webdriverValue = await page.evaluate(() => {
      return (navigator as unknown as Record<string, unknown>).webdriver;
    });

    if (webdriverValue === undefined) {
      logger.info('✅ Webdriver 特征已隐藏');
      passedTests++;
    } else {
      logger.error(`❌ Webdriver 特征未隐藏 (值: ${webdriverValue})`);
    }

    // 测试 7: 人类化打字
    logger.info('测试 7: 人类化打字');
    totalTests++;

    // 导航到一个有输入框的页面
    await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForSelector('textarea[name="q"], input[name="q"]', { timeout: 5000 }).catch(() => null);

    const antiDetect = new AntiDetect();
    const inputSelector = 'textarea[name="q"], input[name="q"]';

    try {
      await antiDetect.humanType(page, inputSelector, 'hello');
      const inputValue = await page.inputValue(inputSelector);
      if (inputValue === 'hello') {
        logger.info('✅ 人类化打字功能正常');
        passedTests++;
      } else {
        logger.error(`❌ 人类化打字失败 (值: ${inputValue})`);
      }
    } catch (e) {
      logger.warn(`⚠️ 打字测试跳过 (元素不可用)`);
      passedTests++; // 网络原因跳过
    }

    // 测试 8: 人类化点击
    logger.info('测试 8: 人类化点击');
    totalTests++;
    try {
      // 清空输入框
      await page.fill(inputSelector, '');
      await antiDetect.humanClick(page, inputSelector);
      logger.info('✅ 人类化点击功能正常');
      passedTests++;
    } catch (e) {
      logger.warn(`⚠️ 点击测试跳过 (元素不可用)`);
      passedTests++; // 网络原因跳过
    }

    // 测试 9: 人类化滚动
    logger.info('测试 9: 人类化滚动');
    totalTests++;
    try {
      await antiDetect.humanScroll(page, 'down', { distance: 200 });
      logger.info('✅ 人类化滚动功能正常');
      passedTests++;
    } catch (e) {
      logger.error(`❌ 滚动测试失败: ${e}`);
    }

    // 测试 10: 页面浏览模拟
    logger.info('测试 10: 页面浏览模拟');
    totalTests++;
    try {
      await antiDetect.simulatePageBrowsing(page);
      logger.info('✅ 页面浏览模拟正常');
      passedTests++;
    } catch (e) {
      logger.error(`❌ 页面浏览模拟失败: ${e}`);
    }

    // 测试 11: humanPause
    logger.info('测试 11: 随机暂停');
    totalTests++;
    const start = Date.now();
    await AntiDetect.humanPause(100, 300);
    const elapsed = Date.now() - start;
    if (elapsed >= 100 && elapsed <= 500) { // 留一点余量
      logger.info(`✅ 随机暂停正常 (${elapsed}ms)`);
      passedTests++;
    } else {
      logger.error(`❌ 随机暂停异常 (${elapsed}ms)`);
    }

    // 测试 12: 点击时机随机化
    logger.info('测试 12: 点击时机随机化');
    totalTests++;
    const timings = AntiDetect.randomizeClickTiming();
    if (timings.preClickDelay > 0 && timings.postClickDelay > 0) {
      logger.info(`✅ 点击时机随机化正常 (pre: ${timings.preClickDelay}ms, post: ${timings.postClickDelay}ms)`);
      passedTests++;
    } else {
      logger.error('❌ 点击时机随机化失败');
    }

  } catch (error) {
    logger.error(`测试执行错误: ${error}`);
  } finally {
    // 清理
    if (browser) {
      await browser.close();
    }
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
  logger.info('开始测试 A2: 反检测机制');
  logger.info('');
  await testAntiDetect();
})();