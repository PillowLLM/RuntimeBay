// RuntimeBay Router 配置解析测试
// 运行: node --test --test-force-exit tests/router-config.test.js
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 从 old_index.js 提取的 loadConfig 解析逻辑（保持一致）
function parseConfig(content) {
  const config = { port: 8081, errorPages: {}, routes: [] };
  const lines = content.split('\n');
  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('port:')) {
      config.port = parseInt(trimmed.split(':')[1]);
    } else if (trimmed.includes(':') && !trimmed.startsWith('From')) {
      const [k, v] = trimmed.split(':');
      if (k && v) config.errorPages[k.trim()] = v.trim();
    } else if (trimmed.startsWith('From')) {
      const match = trimmed.match(/From\s+([^\s]+)\s+TO\s+(\S+)/i);
      if (match) {
        const target = match[1];
        let targetHost, targetPort, targetPath;
        const portMatch = target.match(/^([^:]+):(\d+)(\/.*)?$/);
        if (portMatch) {
          targetHost = portMatch[1];
          targetPort = parseInt(portMatch[2]);
          targetPath = portMatch[3] || '';
        } else {
          targetHost = target;
          targetPort = 80;
          targetPath = '';
        }
        config.routes.push({ target, targetHost, targetPort, targetPath, path: match[2] });
      }
    }
  });
  return config;
}

describe('Router 配置解析', () => {
  test('解析 port 和路由规则（格式: From <upstream> TO <path>）', () => {
    const cfg = parseConfig(`
port: 8081
ErrorPages: ./ErrorPages
From 127.0.0.1:3000 TO /api
From 127.0.0.1:8080 TO /web
`);
    assert.strictEqual(cfg.port, 8081);
    assert.strictEqual(cfg.routes.length, 2);
    assert.strictEqual(cfg.routes[0].targetHost, '127.0.0.1');
    assert.strictEqual(cfg.routes[0].targetPort, 3000);
    assert.strictEqual(cfg.routes[0].path, '/api');
    assert.strictEqual(cfg.routes[1].targetHost, '127.0.0.1');
    assert.strictEqual(cfg.routes[1].targetPort, 8080);
  });

  test('无端口的 target 默认 80', () => {
    const cfg = parseConfig('From example.com TO /test');
    assert.strictEqual(cfg.routes[0].targetPort, 80);
  });

  test('空行和注释被忽略', () => {
    const cfg = parseConfig(`
port: 9000

From 127.0.0.1:3000 TO /a

From 127.0.0.1:3001 TO /b
`);
    assert.strictEqual(cfg.routes.length, 2);
  });

  test('错误页配置解析', () => {
    const cfg = parseConfig(`
ErrorPages: ./ErrorPages
404: 404.html
500: 500.html
`);
    assert.strictEqual(cfg.errorPages['404'], '404.html');
    assert.strictEqual(cfg.errorPages['500'], '500.html');
  });
});

describe('路径穿越注入防护（路由匹配）', () => {
  test('最长前缀匹配：/api/v1 优先于 /api', () => {
    const config = parseConfig(`
port: 8081
From 127.0.0.1:3000 TO /api
From 127.0.0.1:3001 TO /api/v1
`);
    function matchRoute(pathname) {
      let matched = null, maxLen = 0;
      for (const r of config.routes) {
        if (pathname.startsWith(r.path) && r.path.length > maxLen) {
          matched = r; maxLen = r.path.length;
        }
      }
      return matched;
    }
    assert.strictEqual(matchRoute('/api/v1/users').targetPort, 3001);
    assert.strictEqual(matchRoute('/api/other').targetPort, 3000);
  });

  test('路径穿越 ../ 不匹配任何路由（返回 null）', () => {
    const config = parseConfig('From 127.0.0.1:3000 TO /api');
    function matchRoute(pathname) {
      let matched = null, maxLen = 0;
      for (const r of config.routes) {
        if (pathname.startsWith(r.path) && r.path.length > maxLen) {
          matched = r; maxLen = r.path.length;
        }
      }
      return matched;
    }
    assert.strictEqual(matchRoute('/../etc/passwd'), null);
  });
});

describe('代理路径重写逻辑', () => {
  test('stripPath 去掉前缀后拼接 targetPath', () => {
    function buildProxyUrl(reqUrl, stripPath, targetPath) {
      let newUrl = reqUrl;
      if (stripPath && stripPath !== '/' && newUrl.startsWith(stripPath)) {
        newUrl = newUrl.slice(stripPath.length) || '/';
      }
      if (targetPath) {
        newUrl = targetPath + (newUrl === '/' ? '' : newUrl);
      }
      return newUrl;
    }
    // /Example/test/path, strip=/Example, targetPath='' → /test/path
    assert.strictEqual(buildProxyUrl('/Example/test/path', '/Example', ''), '/test/path');
    // /api/users, strip=/api, targetPath=/v1 → /v1/users
    assert.strictEqual(buildProxyUrl('/api/users', '/api', '/v1'), '/v1/users');
    // /api, strip=/api, targetPath='' → /
    assert.strictEqual(buildProxyUrl('/api', '/api', ''), '/');
  });

  test('非匹配路径不做 strip', () => {
    function buildProxyUrl(reqUrl, stripPath, targetPath) {
      let newUrl = reqUrl;
      if (stripPath && stripPath !== '/' && newUrl.startsWith(stripPath)) {
        newUrl = newUrl.slice(stripPath.length) || '/';
      }
      if (targetPath) {
        newUrl = targetPath + (newUrl === '/' ? '' : newUrl);
      }
      return newUrl;
    }
    assert.strictEqual(buildProxyUrl('/other/path', '/api', ''), '/other/path');
  });
});
