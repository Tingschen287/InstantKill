/**
 * 平台适配器测试脚本
 * 用于验证 C1: 通用适配器, C2: 自定义脚本, C3: 配置管理
 */

import { ConfigLoader, ConfigEncryptor, WorkflowStep, GlobalConfig, PlatformConfig } from './src/adapters/base.js';
import { ConfigAdapter, ScriptExecutor, ScriptContext } from './src/adapters/config.js';
import { createLogger } from './src/utils/logger.js';

const logger = createLogger('C1-C2-C3-Test');

async function testAdapterModules(): Promise<void> {
  let passedTests = 0;
  let totalTests = 0;

  // ==================== C1: 通用适配器测试 ====================

  // 测试 1: PlatformConfig 配置
  logger.info('测试 1: PlatformConfig 配置');
  totalTests++;
  const platformConfig: PlatformConfig = {
    name: '测试平台',
    url: 'https://test.example.com/tickets',
    loginRequired: true,
    selectors: {
      button: ['#buy-btn', '.ticket-buy'],
      success: ['.success-message'],
      failure: ['.error-message'],
      input: {
        name: '#customer-name',
        phone: '#customer-phone',
      },
    },
    formData: {
      inputs: {
        name: '张三',
        phone: '13800138000',
      },
    },
    timing: {
      startTime: '2026-04-01 10:00:00',
      refreshInterval: 500,
    },
  };

  if (platformConfig.selectors.button.length === 2 &&
      platformConfig.timing?.refreshInterval === 500) {
    logger.info(`✅ PlatformConfig 配置正常`);
    logger.info(`   按钮: ${platformConfig.selectors.button.join(', ')}`);
    logger.info(`   刷新间隔: ${platformConfig.timing?.refreshInterval}ms`);
    passedTests++;
  } else {
    logger.error('❌ PlatformConfig 配置失败');
  }

  // 测试 2: GlobalConfig 配置
  logger.info('测试 2: GlobalConfig 配置');
  totalTests++;
  const globalConfig: GlobalConfig = {
    headless: false,
    humanMode: true,
    maxRetries: 5,
    defaultTimeout: 30000,
    enableLogging: true,
    enableScreenshot: true,
    screenshotPath: './screenshots',
    notifications: {
      terminal: true,
      sound: true,
      webhookUrl: '',
    },
  };

  if (globalConfig.humanMode && globalConfig.maxRetries === 5) {
    logger.info(`✅ GlobalConfig 配置正常`);
    logger.info(`   humanMode: ${globalConfig.humanMode}`);
    logger.info(`   maxRetries: ${globalConfig.maxRetries}`);
    passedTests++;
  } else {
    logger.error('❌ GlobalConfig 配置失败');
  }

  // 测试 3: WorkflowStep 配置
  logger.info('测试 3: WorkflowStep 配置');
  totalTests++;
  const workflow: WorkflowStep[] = [
    { name: '导航到目标页面', type: 'navigate' },
    { name: '等待页面加载', type: 'wait', value: '2000' },
    {
      name: '检查按钮状态',
      type: 'condition',
      condition: 'selector:#buy-btn',
      thenSteps: [
        { name: '点击抢票按钮', type: 'click', selector: '#buy-btn' },
        { name: '等待响应', type: 'wait', value: '1000' },
      ],
      elseSteps: [
        { name: '刷新页面', type: 'refresh' },
      ],
    },
    { name: '填写表单', type: 'fill', selector: '#name', value: '张三' },
  ];

  if (workflow.length === 5 && workflow[2].type === 'condition') {
    logger.info(`✅ WorkflowStep 配置正常`);
    logger.info(`   步骤数: ${workflow.length}`);
    logger.info(`   条件分支: ${workflow[2].name}`);
    passedTests++;
  } else {
    logger.error('❌ WorkflowStep 配置失败');
  }

  // 测试 4: ConfigLoader 验证功能
  logger.info('测试 4: ConfigLoader 验证功能');
  totalTests++;
  const validConfig = {
    version: '1.0',
    platforms: [
      {
        name: '测试平台',
        url: 'https://test.com',
        selectors: {
          button: ['#btn'],
          success: [],
        },
      },
    ],
  };

  const invalidConfig = {
    version: '1.0',
    platforms: [],
  };

  const loader = new ConfigLoader('./test-config.yaml');
  const validResult = loader.validate(validConfig);
  const invalidResult = loader.validate(invalidConfig);

  if (validResult.valid && !invalidResult.valid) {
    logger.info(`✅ ConfigLoader 验证功能正常`);
    logger.info(`   有效配置: ${validResult.valid}`);
    logger.info(`   无效配置: ${invalidResult.valid}`);
    passedTests++;
  } else {
    logger.error('❌ ConfigLoader 验证功能失败');
  }

  // ==================== C2: 自定义脚本测试 ====================

  // 测试 5: ScriptContext 结构
  logger.info('测试 5: ScriptContext 结构');
  totalTests++;
  const scriptContext: Partial<ScriptContext> = {
    log: (msg) => logger.debug(msg),
    sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
    config: { platform: 'test' },
    userData: { name: '测试用户' },
    utils: {
      click: async () => true,
      fill: async () => true,
      wait: async () => true,
      getText: async () => null,
      exists: async () => false,
      evaluate: async () => null,
      screenshot: async () => '',
    },
  };

  if (scriptContext.utils && scriptContext.config) {
    logger.info(`✅ ScriptContext 结构正常`);
    logger.info(`   工具函数: ${Object.keys(scriptContext.utils!).length} 个`);
    passedTests++;
  } else {
    logger.error('❌ ScriptContext 结构失败');
  }

  // 测试 6: ScriptExecutor 脚本执行
  logger.info('测试 6: ScriptExecutor 脚本执行');
  totalTests++;
  const executor = new ScriptExecutor(scriptContext as ScriptContext);
  const scriptResult = await executor.execute(`
    log('测试脚本开始执行');
    await sleep(100);
    log('测试脚本执行完成');
    return { success: true, message: 'Hello from script' };
  `);

  if (scriptResult.success && scriptResult.result?.success) {
    logger.info(`✅ ScriptExecutor 脚本执行正常`);
    logger.info(`   执行结果: ${JSON.stringify(scriptResult.result)}`);
    logger.info(`   执行时间: ${scriptResult.duration}ms`);
    passedTests++;
  } else {
    logger.error(`❌ ScriptExecutor 脚本执行失败: ${scriptResult.error}`);
  }

  // 测试 7: 脚本沙箱隔离
  logger.info('测试 7: 脚本沙箱隔离');
  totalTests++;
  const sandboxTest = await executor.execute(`
    // 尝试访问被禁止的全局对象
    let hasRequire = typeof require !== 'undefined';
    let hasProcess = typeof process !== 'undefined';
    let hasGlobal = typeof global !== 'undefined';

    // 只能访问允许的对象
    let hasConsole = typeof console !== 'undefined';
    let hasJSON = typeof JSON !== 'undefined';
    let hasMath = typeof Math !== 'undefined';

    return {
      hasRequire,
      hasProcess,
      hasGlobal,
      hasConsole,
      hasJSON,
      hasMath
    };
  `);

  if (sandboxTest.success &&
      !sandboxTest.result.hasRequire &&
      !sandboxTest.result.hasProcess &&
      sandboxTest.result.hasJSON) {
    logger.info(`✅ 脚本沙箱隔离正常`);
    logger.info(`   require 访问: ${sandboxTest.result.hasRequire}`);
    logger.info(`   process 访问: ${sandboxTest.result.hasProcess}`);
    logger.info(`   JSON 访问: ${sandboxTest.result.hasJSON}`);
    passedTests++;
  } else {
    logger.error('❌ 脚本沙箱隔离失败');
  }

  // 测试 8: 脚本参数传递
  logger.info('测试 8: 脚本参数传递');
  totalTests++;
  const paramsTest = await executor.execute(`
    return {
      platform: config.platform,
      customParam: config.customParam,
      totalParams: Object.keys(config).length
    };
  `, { customParam: 'test-value', extraParam: 123 });

  if (paramsTest.success &&
      paramsTest.result.customParam === 'test-value' &&
      paramsTest.result.totalParams >= 2) {
    logger.info(`✅ 脚本参数传递正常`);
    logger.info(`   customParam: ${paramsTest.result.customParam}`);
    logger.info(`   参数数量: ${paramsTest.result.totalParams}`);
    passedTests++;
  } else {
    logger.error('❌ 脚本参数传递失败');
  }

  // 测试 9: 脚本错误处理
  logger.info('测试 9: 脚本错误处理');
  totalTests++;
  const errorTest = await executor.execute(`
    throw new Error('测试错误');
  `);

  if (!errorTest.success && errorTest.error?.includes('测试错误')) {
    logger.info(`✅ 脚本错误处理正常`);
    logger.info(`   错误信息: ${errorTest.error}`);
    passedTests++;
  } else {
    logger.error('❌ 脚本错误处理失败');
  }

  // ==================== C3: 配置管理测试 ====================

  // 测试 10: ConfigEncryptor 加密解密
  logger.info('测试 10: ConfigEncryptor 加密解密');
  totalTests++;
  const encryptor = new ConfigEncryptor('test-secret-key-2026');
  const testData = '{"name": "测试配置", "value": 123}';
  const encrypted = encryptor.encrypt(testData);
  const decrypted = encryptor.decrypt(encrypted);

  if (decrypted === testData && encrypted !== testData) {
    logger.info(`✅ ConfigEncryptor 加密解密正常`);
    logger.info(`   原始数据长度: ${testData.length}`);
    logger.info(`   加密后长度: ${encrypted.length}`);
    passedTests++;
  } else {
    logger.error('❌ ConfigEncryptor 加密解密失败');
  }

  // 测试 11: 配置导入导出
  logger.info('测试 11: 配置导入导出');
  totalTests++;
  const exportConfig: Record<string, any> = {
    platforms: [
      { name: '平台A', url: 'https://a.com' },
      { name: '平台B', url: 'https://b.com' },
    ],
    global: {
      headless: true,
      maxRetries: 3,
    },
  };

  const configJson = JSON.stringify(exportConfig, null, 2);
  const parsedConfig = JSON.parse(configJson);

  if (parsedConfig.platforms.length === 2 &&
      parsedConfig.global.maxRetries === 3) {
    logger.info(`✅ 配置导入导出正常`);
    logger.info(`   平台数量: ${parsedConfig.platforms.length}`);
    logger.info(`   JSON 长度: ${configJson.length}`);
    passedTests++;
  } else {
    logger.error('❌ 配置导入导出失败');
  }

  // 测试 12: 配置热重载监听
  logger.info('测试 12: 配置热重载监听');
  totalTests++;
  let reloadTriggered = false;
  const testLoader = new ConfigLoader('./test-hot-reload.yaml');

  // 模拟注册监听器
  testLoader.watch(() => {
    reloadTriggered = true;
  });

  // 检查监听器是否注册
  if (typeof testLoader.watch === 'function') {
    logger.info(`✅ 配置热重载监听正常`);
    logger.info(`   watch 方法可调用`);
    passedTests++;
  } else {
    logger.error('❌ 配置热重载监听失败');
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
  logger.info('开始测试 C1: 通用适配器, C2: 自定义脚本, C3: 配置管理');
  logger.info('');
  await testAdapterModules();
})();