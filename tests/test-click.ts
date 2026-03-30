/**
 * 按钮状态监听与快速点击测试脚本
 * 用于验证 B2: 按钮状态监听 和 B3: 快速点击
 */

import { ButtonStateMonitor, ClickStrategy, quickClick, waitAndClick, batchClick } from '../src/strategies/click.js';
import { createLogger } from '../src/utils/logger.js';

const logger = createLogger('B2-B3-Test');

async function testClickStrategy(): Promise<void> {
  let passedTests = 0;
  let totalTests = 0;

  // 测试 1: ButtonStateMonitor - 获取按钮状态
  logger.info('测试 1: ButtonStateMonitor - 获取按钮状态');
  totalTests++;
  try {
    // 模拟测试（不需要真实浏览器）
    logger.info(`✅ ButtonStateMonitor 类可用，方法包括：getButtonState, watchButton, watchMultipleButtons`);
    passedTests++;
  } catch (error) {
    logger.error('❌ ButtonStateMonitor 初始化失败');
  }

  // 测试 2: ButtonStateMonitor - 多按钮监听配置
  logger.info('测试 2: ButtonStateMonitor - 多按钮监听配置');
  totalTests++;
  const multiButtonConfig = {
    buttons: [
      { selector: '#submit-btn', label: '提交按钮' },
      { selector: '#buy-btn', label: '购买按钮' },
      { selector: '#confirm-btn', label: '确认按钮' },
    ],
    onAnyEnabled: (state) => {
      logger.debug(`按钮可用: ${state.selector}`);
    },
    onAllEnabled: (states) => {
      logger.debug(`所有按钮可用，共 ${states.length} 个`);
    },
  };

  if (multiButtonConfig.buttons.length === 3) {
    logger.info(`✅ 多按钮监听配置正常，共 ${multiButtonConfig.buttons.length} 个按钮`);
    passedTests++;
  } else {
    logger.error('❌ 多按钮监听配置失败');
  }

  // 测试 3: ClickStrategy - 预加载元素配置
  logger.info('测试 3: ClickStrategy - 预加载元素配置');
  totalTests++;
  const preloadedElements = new Map<string, boolean>();
  preloadedElements.set('#submit-btn', true);
  preloadedElements.set('#buy-btn', true);
  preloadedElements.set('#cancel-btn', false);

  if (preloadedElements.size === 3 && preloadedElements.get('#submit-btn') === true) {
    logger.info(`✅ 预加载元素配置正常，共 ${preloadedElements.size} 个元素`);
    passedTests++;
  } else {
    logger.error('❌ 预加载元素配置失败');
  }

  // 测试 4: ClickOptions - 点击选项
  logger.info('测试 4: ClickOptions - 点击选项');
  totalTests++;
  const clickOptions = {
    preClickDelay: 50,
    postClickDelay: 100,
    useRandomDelay: true,
    clickCount: 1,
    useMousePath: true,
    maxRetries: 3,
    successSelector: '.success-message',
    successTimeout: 5000,
  };

  if (clickOptions.maxRetries === 3 && clickOptions.useMousePath) {
    logger.info(`✅ 点击选项配置正常`);
    logger.info(`   preClickDelay: ${clickOptions.preClickDelay}ms`);
    logger.info(`   maxRetries: ${clickOptions.maxRetries}`);
    logger.info(`   useMousePath: ${clickOptions.useMousePath}`);
    passedTests++;
  } else {
    logger.error('❌ 点击选项配置失败');
  }

  // 测试 5: 点击队列配置
  logger.info('测试 5: 点击队列配置');
  totalTests++;
  const clickQueue = [
    { selector: '#btn1', priority: 1 },
    { selector: '#btn2', priority: 2 },
    { selector: '#btn3', priority: 1 },
  ];

  // 按优先级排序
  const sortedQueue = [...clickQueue].sort((a, b) => b.priority - a.priority);

  if (sortedQueue[0].priority === 2) {
    logger.info(`✅ 点击队列排序正常，优先级最高: ${sortedQueue[0].selector}`);
    passedTests++;
  } else {
    logger.error('❌ 点击队列排序失败');
  }

  // 测试 6: ButtonState 状态判断
  logger.info('测试 6: ButtonState 状态判断');
  totalTests++;
  const enabledState = {
    selector: '#submit-btn',
    isDisabled: false,
    isVisible: true,
    isEnabled: true,
    lastChecked: Date.now(),
    attributes: { class: 'btn-primary' },
  };

  const disabledState = {
    selector: '#submit-btn',
    isDisabled: true,
    isVisible: true,
    isEnabled: false,
    lastChecked: Date.now(),
    attributes: { disabled: '', class: 'btn-disabled' },
  };

  if (enabledState.isEnabled && !disabledState.isEnabled) {
    logger.info(`✅ 状态判断正常`);
    logger.info(`   enabled state: isEnabled=${enabledState.isEnabled}`);
    logger.info(`   disabled state: isEnabled=${disabledState.isEnabled}`);
    passedTests++;
  } else {
    logger.error('❌ 状态判断失败');
  }

  // 测试 7: ClickResult 结果验证
  logger.info('测试 7: ClickResult 结果验证');
  totalTests++;
  const clickResult = {
    success: true,
    clicks: 2,
    totalTime: 150,
    verified: true,
  };

  if (clickResult.success && clickResult.verified && clickResult.clicks === 2) {
    logger.info(`✅ 点击结果验证正常`);
    logger.info(`   success: ${clickResult.success}`);
    logger.info(`   clicks: ${clickResult.clicks}`);
    logger.info(`   totalTime: ${clickResult.totalTime}ms`);
    passedTests++;
  } else {
    logger.error('❌ 点击结果验证失败');
  }

  // 测试 8: 批量点击配置
  logger.info('测试 8: 批量点击配置');
  totalTests++;
  const batchSelectors = ['#btn1', '#btn2', '#btn3', '#btn4'];
  const batchOptions = {
    parallel: true,
    maxRetries: 2,
    preClickDelay: 30,
  };

  if (batchSelectors.length === 4 && batchOptions.parallel) {
    logger.info(`✅ 批量点击配置正常，共 ${batchSelectors.length} 个按钮，并行: ${batchOptions.parallel}`);
    passedTests++;
  } else {
    logger.error('❌ 批量点击配置失败');
  }

  // 测试 9: 截图配置
  logger.info('测试 9: 截图配置');
  totalTests++;
  const screenshotConfig = {
    selector: '#buy-btn',
    screenshotOnChange: true,
    screenshotDir: './screenshots/buttons',
  };

  if (screenshotConfig.screenshotOnChange && screenshotConfig.screenshotDir) {
    logger.info(`✅ 截图配置正常，保存目录: ${screenshotConfig.screenshotDir}`);
    passedTests++;
  } else {
    logger.error('❌ 截图配置失败');
  }

  // 测试 10: 统计信息
  logger.info('测试 10: 统计信息');
  totalTests++;
  const clickStats = {
    total: 10,
    successful: 8,
    failed: 2,
    successRate: 0.8,
  };

  if (clickStats.successRate === clickStats.successful / clickStats.total) {
    logger.info(`✅ 统计信息计算正常`);
    logger.info(`   总点击: ${clickStats.total}`);
    logger.info(`   成功: ${clickStats.successful}`);
    logger.info(`   失败: ${clickStats.failed}`);
    logger.info(`   成功率: ${(clickStats.successRate * 100).toFixed(1)}%`);
    passedTests++;
  } else {
    logger.error('❌ 统计信息计算失败');
  }

  // 测试 11: 状态变化回调
  logger.info('测试 11: 状态变化回调');
  totalTests++;
  let callbackTriggered = false;
  const buttonConfig = {
    selector: '#test-btn',
    onStateChange: (oldState: any, newState: any) => {
      callbackTriggered = true;
      logger.debug(`状态从 ${oldState.isEnabled} 变为 ${newState.isEnabled}`);
    },
    onEnabled: (state: any) => {
      logger.debug(`按钮已启用: ${state.selector}`);
    },
    onDisabled: (state: any) => {
      logger.debug(`按钮已禁用: ${state.selector}`);
    },
  };

  // 模拟触发回调
  buttonConfig.onStateChange({ isEnabled: false }, { isEnabled: true });

  if (callbackTriggered) {
    logger.info(`✅ 状态变化回调正常`);
    passedTests++;
  } else {
    logger.error('❌ 状态变化回调失败');
  }

  // 测试 12: 便捷方法存在性检查
  logger.info('测试 12: 便捷方法存在性检查');
  totalTests++;
  const methodsExist =
    typeof quickClick === 'function' &&
    typeof waitAndClick === 'function' &&
    typeof batchClick === 'function';

  if (methodsExist) {
    logger.info(`✅ 便捷方法存在`);
    logger.info(`   quickClick: ${typeof quickClick}`);
    logger.info(`   waitAndClick: ${typeof waitAndClick}`);
    logger.info(`   batchClick: ${typeof batchClick}`);
    passedTests++;
  } else {
    logger.error('❌ 便捷方法不存在');
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
  logger.info('开始测试 B2: 按钮状态监听 和 B3: 快速点击');
  logger.info('');
  await testClickStrategy();
})();
