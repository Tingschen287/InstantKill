/**
 * 自动重试机制测试脚本
 * 用于验证 A4: 自动重试机制
 */

import { RetryManager, ErrorClassifier, DelayCalculator, quickRetry, retryUntilSuccess, retryWithCondition } from './src/engine/retry.js';
import { createLogger } from './src/utils/logger.js';

const logger = createLogger('A4-Test');

async function testRetryMechanism(): Promise<void> {
  let passedTests = 0;
  let totalTests = 0;

  // 测试 1: 错误分类器
  logger.info('测试 1: 错误分类器');
  totalTests++;
  const networkError = new Error('Network connection failed');
  const timeoutError = new Error('Operation timeout after 5000ms');
  const rateLimitError = new Error('Too many requests - 429');
  const clientError = new Error('Bad request - 400');

  const networkType = ErrorClassifier.classify(networkError);
  const timeoutType = ErrorClassifier.classify(timeoutError);
  const rateLimitType = ErrorClassifier.classify(rateLimitError);
  const clientType = ErrorClassifier.classify(clientError);

  if (networkType === 'network' && timeoutType === 'timeout' &&
      rateLimitType === 'rate_limit' && clientType === 'client_error') {
    logger.info(`✅ 错误分类器正常`);
    logger.info(`   network -> ${networkType}`);
    logger.info(`   timeout -> ${timeoutType}`);
    logger.info(`   rate_limit -> ${rateLimitType}`);
    logger.info(`   client_error -> ${clientType}`);
    passedTests++;
  } else {
    logger.error('❌ 错误分类器失败');
  }

  // 测试 2: 可重试判断
  logger.info('测试 2: 可重试判断');
  totalTests++;
  const isNetworkRetryable = ErrorClassifier.isRetryable(networkError);
  const isClientRetryable = ErrorClassifier.isRetryable(clientError);

  if (isNetworkRetryable && !isClientRetryable) {
    logger.info(`✅ 可重试判断正常`);
    logger.info(`   network error -> ${isNetworkRetryable}`);
    logger.info(`   client error -> ${isClientRetryable}`);
    passedTests++;
  } else {
    logger.error('❌ 可重试判断失败');
  }

  // 测试 3: 延迟计算器 - 固定策略
  logger.info('测试 3: 延迟计算器 - 固定策略');
  totalTests++;
  const fixedDelays = [1, 2, 3, 4, 5].map(i =>
    DelayCalculator.calculate('fixed', i, { initialDelay: 1000, maxDelay: 10000, backoffFactor: 2 })
  );
  const allFixedSame = fixedDelays.every(d => d === 1000);
  if (allFixedSame) {
    logger.info(`✅ 固定策略正常: ${fixedDelays.join(', ')}`);
    passedTests++;
  } else {
    logger.error('❌ 固定策略失败');
  }

  // 测试 4: 延迟计算器 - 指数策略
  logger.info('测试 4: 延迟计算器 - 指数策略');
  totalTests++;
  const expDelays = [1, 2, 3, 4].map(i =>
    DelayCalculator.calculate('exponential', i, { initialDelay: 1000, maxDelay: 10000, backoffFactor: 2 })
  );
  // 1000, 2000, 4000, 8000
  if (expDelays[0] === 1000 && expDelays[1] === 2000 && expDelays[2] === 4000 && expDelays[3] === 8000) {
    logger.info(`✅ 指数策略正常: ${expDelays.join(', ')}`);
    passedTests++;
  } else {
    logger.error(`❌ 指数策略失败: ${expDelays.join(', ')}`);
  }

  // 测试 5: 延迟计算器 - 最大延迟限制
  logger.info('测试 5: 延迟计算器 - 最大延迟限制');
  totalTests++;
  const maxLimitedDelay = DelayCalculator.calculate('exponential', 10, {
    initialDelay: 1000,
    maxDelay: 5000,
    backoffFactor: 2
  });
  if (maxLimitedDelay === 5000) {
    logger.info(`✅ 最大延迟限制正常: ${maxLimitedDelay}ms`);
    passedTests++;
  } else {
    logger.error(`❌ 最大延迟限制失败: ${maxLimitedDelay}ms`);
  }

  // 测试 6: RetryManager - 成功场景
  logger.info('测试 6: RetryManager - 成功场景');
  totalTests++;
  let callCount = 0;
  const manager = new RetryManager({
    maxRetries: 3,
    initialDelay: 100,
    operationName: 'test-success',
  });

  const successResult = await manager.execute(async () => {
    callCount++;
    return 'success';
  });

  if (successResult.success && successResult.result === 'success' && callCount === 1) {
    logger.info(`✅ 成功场景正常，调用 ${callCount} 次`);
    passedTests++;
  } else {
    logger.error('❌ 成功场景失败');
  }

  // 测试 7: RetryManager - 重试场景
  logger.info('测试 7: RetryManager - 重试场景');
  totalTests++;
  let retryCount = 0;
  const retryManager = new RetryManager({
    maxRetries: 3,
    initialDelay: 50,
    strategy: 'fixed',
    operationName: 'test-retry',
    onRetry: (error, attempt) => {
      logger.debug(`重试回调: 第 ${attempt} 次，错误: ${error.message}`);
    },
  });

  const retryResult = await retryManager.execute(async () => {
    retryCount++;
    if (retryCount < 3) {
      throw new Error('Network error');
    }
    return 'recovered';
  });

  if (retryResult.success && retryResult.result === 'recovered' && retryCount === 3) {
    logger.info(`✅ 重试场景正常，调用 ${retryCount} 次后成功`);
    passedTests++;
  } else {
    logger.error(`❌ 重试场景失败，调用 ${retryCount} 次，结果: ${retryResult.success}`);
  }

  // 测试 8: RetryManager - 最终失败场景
  logger.info('测试 8: RetryManager - 最终失败场景');
  totalTests++;
  let failCount = 0;
  const failManager = new RetryManager({
    maxRetries: 2,
    initialDelay: 50,
    operationName: 'test-fail',
  });

  const failResult = await failManager.execute(async () => {
    failCount++;
    throw new Error('Network error');
  });

  if (!failResult.success && failCount === 3) { // 初始 + 2 次重试
    logger.info(`✅ 最终失败场景正常，调用 ${failCount} 次后失败`);
    passedTests++;
  } else {
    logger.error(`❌ 最终失败场景异常`);
  }

  // 测试 9: RetryManager - 中止操作
  logger.info('测试 9: RetryManager - 中止操作');
  totalTests++;
  let abortCount = 0;
  const abortManager = new RetryManager({
    maxRetries: 5,
    initialDelay: 100,
    operationName: 'test-abort',
  });

  // 延迟中止
  setTimeout(() => abortManager.abort(), 150);

  const abortResult = await abortManager.execute(async () => {
    abortCount++;
    throw new Error('Network error');
  });

  if (!abortResult.success && abortResult.error?.message.includes('aborted')) {
    logger.info(`✅ 中止操作正常，调用 ${abortCount} 次后被中止`);
    passedTests++;
  } else {
    logger.error(`❌ 中止操作失败`);
  }

  // 测试 10: quickRetry 便捷方法
  logger.info('测试 10: quickRetry 便捷方法');
  totalTests++;
  let quickCount = 0;

  try {
    await quickRetry(async () => {
      quickCount++;
      if (quickCount < 3) throw new Error('fail');
      return 'quick-success';
    }, 5, 10);

    if (quickCount === 3) {
      logger.info(`✅ quickRetry 正常，调用 ${quickCount} 次`);
      passedTests++;
    }
  } catch {
    logger.error('❌ quickRetry 失败');
  }

  // 测试 11: retryUntilSuccess 便捷方法
  logger.info('测试 11: retryUntilSuccess 便捷方法');
  totalTests++;
  let untilCount = 0;

  try {
    const result = await retryUntilSuccess(async () => {
      untilCount++;
      if (untilCount < 3) throw new Error('not yet');
      return 'until-success';
    }, { interval: 10, maxAttempts: 5 });

    if (result === 'until-success' && untilCount === 3) {
      logger.info(`✅ retryUntilSuccess 正常，调用 ${untilCount} 次`);
      passedTests++;
    }
  } catch {
    logger.error('❌ retryUntilSuccess 失败');
  }

  // 测试 12: retryWithCondition 便捷方法
  logger.info('测试 12: retryWithCondition 便捷方法');
  totalTests++;
  let conditionCount = 0;

  try {
    const result = await retryWithCondition(
      async () => {
        conditionCount++;
        return { value: conditionCount };
      },
      (result) => result.value >= 3,
      { maxRetries: 5, delay: 10 }
    );

    if (result.value === 3) {
      logger.info(`✅ retryWithCondition 正常，调用 ${conditionCount} 次`);
      passedTests++;
    }
  } catch {
    logger.error('❌ retryWithCondition 失败');
  }

  // 测试 13: 重试历史记录
  logger.info('测试 13: 重试历史记录');
  totalTests++;
  const historyManager = new RetryManager({
    maxRetries: 3,
    initialDelay: 50,
    operationName: 'test-history',
  });

  const historyResult = await historyManager.execute(async () => {
    throw new Error('Network error');
  });

  if (historyResult.retryHistory.length > 0) {
    logger.info(`✅ 重试历史记录正常，共 ${historyResult.retryHistory.length} 条`);
    passedTests++;
  } else {
    logger.error('❌ 重试历史记录失败');
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
  logger.info('开始测试 A4: 自动重试机制');
  logger.info('');
  await testRetryMechanism();
})();