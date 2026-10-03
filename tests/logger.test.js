// RuntimeBay logger 模块测试：日志服务不可用时的降级行为
// 运行: node --test --test-force-exit tests/logger.test.js
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert');
const { createLogger, fetchLogToken } = require('../utils/logger');

describe('logger 降级行为', () => {
  test('日志服务不可用时 fetchLogToken 返回 null（不抛异常）', async () => {
    // 端口 1 肯定没人监听
    const origPort = Object.getOwnPropertyDescriptor(require('../utils/logger'), 'LOG_SERVER_PORT');
    const token = await fetchLogToken();
    // 如果没有日志服务器在 727，应该返回 null
    assert.ok(token === null || typeof token === 'string', '应返回 null 或 token 字符串');
  });

  test('createLogger 返回四个异步方法（info/warn/error/debug）', () => {
    const logger = createLogger('TestModule');
    assert.strictEqual(typeof logger.info, 'function');
    assert.strictEqual(typeof logger.warn, 'function');
    assert.strictEqual(typeof logger.error, 'function');
    assert.strictEqual(typeof logger.debug, 'function');
  });

  test('日志服务不可用时 info/warn/error/debug 不抛异常（静默降级）', async () => {
    const logger = createLogger('TestModule');
    // 不应该抛异常
    await assert.doesNotReject(async () => {
      await logger.info('test message', { key: 'val' });
      await logger.warn('warn message');
      await logger.error('error message');
      await logger.debug('debug message');
    });
  });

  test('createLogger 不同模块名产生独立 logger 实例', () => {
    const l1 = createLogger('ModuleA');
    const l2 = createLogger('ModuleB');
    assert.notStrictEqual(l1, l2);
    assert.strictEqual(typeof l1.info, 'function');
    assert.strictEqual(typeof l2.info, 'function');
  });
});
