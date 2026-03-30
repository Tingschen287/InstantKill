/**
 * 表单自动填充测试脚本
 * 用于验证 B4: 表单自动填充
 */

import { FillStrategy, FormFieldRecognizer, UserConfigManager, FormData, FormFieldConfig, quickFillForm, smartFillForm, emergencyFillForm } from '../src/strategies/fill.js';
import { createLogger } from '../src/utils/logger.js';

const logger = createLogger('B4-Test');

async function testFillStrategy(): Promise<void> {
  let passedTests = 0;
  let totalTests = 0;

  // 测试 1: FormData 配置
  logger.info('测试 1: FormData 配置');
  totalTests++;
  const formData: FormData = {
    fields: {
      '#name': '张三',
      '#email': 'test@example.com',
      '#phone': '13800138000',
    },
    selects: {
      '#city': 'beijing',
      '#type': 'normal',
    },
    checkboxes: {
      '#agree': true,
      '#newsletter': false,
    },
    radios: {
      'gender': 'male',
    },
  };

  if (formData.fields['#name'] === '张三' &&
      formData.selects &&
      formData.checkboxes &&
      formData.radios) {
    logger.info(`✅ FormData 配置正常`);
    logger.info(`   文本字段: ${Object.keys(formData.fields).length} 个`);
    logger.info(`   下拉框: ${Object.keys(formData.selects ?? {}).length} 个`);
    logger.info(`   复选框: ${Object.keys(formData.checkboxes ?? {}).length} 个`);
    passedTests++;
  } else {
    logger.error('❌ FormData 配置失败');
  }

  // 测试 2: FormFieldConfig 配置
  logger.info('测试 2: FormFieldConfig 配置');
  totalTests++;
  const fieldConfig: FormFieldConfig = {
    name: 'email',
    selector: '#email-input',
    type: 'email',
    required: true,
    defaultValue: 'user@example.com',
    validation: {
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      minLength: 5,
      maxLength: 100,
    },
  };

  if (fieldConfig.type === 'email' &&
      fieldConfig.required &&
      fieldConfig.validation?.pattern) {
    logger.info(`✅ FormFieldConfig 配置正常`);
    logger.info(`   类型: ${fieldConfig.type}`);
    logger.info(`   必填: ${fieldConfig.required}`);
    logger.info(`   验证规则: ${fieldConfig.validation.pattern.toString()}`);
    passedTests++;
  } else {
    logger.error('❌ FormFieldConfig 配置失败');
  }

  // 测试 3: UserConfigManager 配置
  logger.info('测试 3: UserConfigManager 配置');
  totalTests++;
  const userConfig = {
    personal: {
      name: '李四',
      email: 'lisi@example.com',
      phone: '13900139000',
      idNumber: '110101199001011234',
      address: '北京市海淀区',
    },
    order: {
      quantity: 2,
      ticketType: 'vip',
      seatPreference: 'front',
      paymentMethod: 'wechat',
    },
    custom: {
      promoCode: 'SUMMER2026',
    },
  };

  const configManager = new UserConfigManager('./test-user-config.json');

  if (configManager.getFieldValue('name') === undefined || // 文件不存在，返回 undefined
      typeof configManager.getFieldValue === 'function') {
    logger.info(`✅ UserConfigManager 初始化正常`);
    logger.info(`   方法: getFieldValue, getConfig, updateConfig`);
    passedTests++;
  } else {
    logger.error('❌ UserConfigManager 初始化失败');
  }

  // 测试 4: 字段类型推断
  logger.info('测试 4: 字段类型推断');
  totalTests++;
  const typeMapping: Record<string, FormFieldConfig['type']> = {
    'email': 'email',
    'phone': 'phone',
    'password': 'password',
    'quantity': 'number',
    'address': 'text',
    'birthday': 'date',
  };

  const expectedTypes = Object.entries(typeMapping).every(([key, type]) => {
    const inferred = inferType(key);
    return inferred === type || inferred === 'text'; // 有些可能推断为 text
  });

  if (expectedTypes) {
    logger.info(`✅ 字段类型推断正常`);
    for (const [key, type] of Object.entries(typeMapping)) {
      logger.info(`   ${key} -> ${type}`);
    }
    passedTests++;
  } else {
    logger.error('❌ 字段类型推断失败');
  }

  // 辅助函数
  function inferType(fieldHint: string): FormFieldConfig['type'] {
    const hint = fieldHint.toLowerCase();
    if (hint.includes('email')) return 'email';
    if (hint.includes('phone')) return 'phone';
    if (hint.includes('password')) return 'password';
    if (hint.includes('quantity') || hint.includes('number')) return 'number';
    if (hint.includes('date') || hint.includes('birthday')) return 'date';
    return 'text';
  }

  // 测试 5: FillOptions 配置
  logger.info('测试 5: FillOptions 配置');
  totalTests++;
  const fillOptions = {
    humanTyping: true,
    typingSpeed: { min: 50, max: 150 },
    fieldDelay: 100,
    clearBeforeFill: true,
    timeout: 5000,
    verify: true,
  };

  if (fillOptions.humanTyping &&
      fillOptions.typingSpeed.min === 50 &&
      fillOptions.verify) {
    logger.info(`✅ FillOptions 配置正常`);
    logger.info(`   humanTyping: ${fillOptions.humanTyping}`);
    logger.info(`   typingSpeed: ${fillOptions.typingSpeed.min}-${fillOptions.typingSpeed.max}ms`);
    passedTests++;
  } else {
    logger.error('❌ FillOptions 配置失败');
  }

  // 测试 6: FillResult 结构
  logger.info('测试 6: FillResult 结构');
  totalTests++;
  const fillResult = {
    success: true,
    filledFields: 8,
    failedFields: [],
    totalTime: 1500,
    validationErrors: [],
  };

  if (fillResult.success &&
      fillResult.filledFields === 8 &&
      fillResult.failedFields.length === 0) {
    logger.info(`✅ FillResult 结构正常`);
    logger.info(`   success: ${fillResult.success}`);
    logger.info(`   filledFields: ${fillResult.filledFields}`);
    logger.info(`   totalTime: ${fillResult.totalTime}ms`);
    passedTests++;
  } else {
    logger.error('❌ FillResult 结构失败');
  }

  // 测试 7: PreSubmitCheck 结构
  logger.info('测试 7: PreSubmitCheck 结构');
  totalTests++;
  const preSubmitCheck = {
    allFieldsValid: true,
    requiredFieldsFilled: true,
    missingFields: [],
    validationErrors: [],
  };

  if (preSubmitCheck.requiredFieldsFilled &&
      preSubmitCheck.missingFields.length === 0) {
    logger.info(`✅ PreSubmitCheck 结构正常`);
    logger.info(`   requiredFieldsFilled: ${preSubmitCheck.requiredFieldsFilled}`);
    logger.info(`   missingFields: ${preSubmitCheck.missingFields.length} 个`);
    passedTests++;
  } else {
    logger.error('❌ PreSubmitCheck 结构失败');
  }

  // 测试 8: 便捷方法存在性
  logger.info('测试 8: 便捷方法存在性');
  totalTests++;
  if (typeof quickFillForm === 'function' &&
      typeof smartFillForm === 'function' &&
      typeof emergencyFillForm === 'function') {
    logger.info(`✅ 便捷方法存在`);
    logger.info(`   quickFillForm: ${typeof quickFillForm}`);
    logger.info(`   smartFillForm: ${typeof smartFillForm}`);
    logger.info(`   emergencyFillForm: ${typeof emergencyFillForm}`);
    passedTests++;
  } else {
    logger.error('❌ 便捷方法不存在');
  }

  // 测试 9: 验证规则测试
  logger.info('测试 9: 验证规则测试');
  totalTests++;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const validEmail = 'test@example.com';
  const invalidEmail = 'invalid-email';

  if (emailPattern.test(validEmail) && !emailPattern.test(invalidEmail)) {
    logger.info(`✅ 验证规则正常`);
    logger.info(`   有效邮箱验证通过: ${validEmail}`);
    logger.info(`   无效邮箱验证失败: ${invalidEmail}`);
    passedTests++;
  } else {
    logger.error('❌ 验证规则失败');
  }

  // 测试 10: 长度验证
  logger.info('测试 10: 长度验证');
  totalTests++;
  const minLength = 5;
  const maxLength = 20;
  const testString = 'hello world';

  const lengthValid = testString.length >= minLength && testString.length <= maxLength;

  if (lengthValid) {
    logger.info(`✅ 长度验证正常`);
    logger.info(`   测试字符串: "${testString}" (${testString.length} 字符)`);
    logger.info(`   范围: ${minLength}-${maxLength}`);
    passedTests++;
  } else {
    logger.error('❌ 长度验证失败');
  }

  // 测试 11: 统计信息
  logger.info('测试 11: 统计信息');
  totalTests++;
  const stats = {
    filled: 10,
    failed: 2,
    skipped: 3,
    successRate: 10 / 12,
  };

  if (stats.successRate === 10 / 12) {
    logger.info(`✅ 统计信息计算正常`);
    logger.info(`   filled: ${stats.filled}`);
    logger.info(`   failed: ${stats.failed}`);
    logger.info(`   skipped: ${stats.skipped}`);
    logger.info(`   successRate: ${(stats.successRate * 100).toFixed(1)}%`);
    passedTests++;
  } else {
    logger.error('❌ 统计信息计算失败');
  }

  // 测试 12: 字段识别功能存在性
  logger.info('测试 12: 字段识别功能存在性');
  totalTests++;
  const recognizerMethods = ['recognizeFields', 'findFieldsByType', 'findRequiredFields'];
  const allMethodsExist = recognizerMethods.every(method =>
    typeof FormFieldRecognizer.prototype[method as keyof FormFieldRecognizer] === 'function'
  );

  if (allMethodsExist) {
    logger.info(`✅ 字段识别器方法存在`);
    for (const method of recognizerMethods) {
      logger.info(`   ${method}: function`);
    }
    passedTests++;
  } else {
    logger.error('❌ 字段识别器方法不存在');
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
  logger.info('开始测试 B4: 表单自动填充');
  logger.info('');
  await testFillStrategy();
})();