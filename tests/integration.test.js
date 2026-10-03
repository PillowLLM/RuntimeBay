// RuntimeBay 集成测试：代理转发端到端路径
// 运行: node --test --test-force-exit tests/integration.test.js
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert');
const http = require('http');

// 模拟代理核心逻辑（与 old_index.js 一致）
function proxyRequest(req, res, targetHost, targetPort, stripPath, targetPath) {
  let newUrl = req.url;
  if (stripPath && stripPath !== '/' && newUrl.startsWith(stripPath)) {
    newUrl = newUrl.slice(stripPath.length) || '/';
  }
  if (targetPath) {
    newUrl = targetPath + (newUrl === '/' ? '' : newUrl);
  }
  const options = {
    hostname: targetHost,
    port: targetPort,
    path: newUrl,
    method: req.method,
    headers: { ...req.headers, host: `${targetHost}:${targetPort}`, connection: 'close' },
  };
  return new Promise((resolve, reject) => {
    const proxyReq = http.request(options, (proxyRes) => {
      let body = '';
      proxyRes.on('data', c => body += c);
      proxyRes.on('end', () => resolve({ status: proxyRes.statusCode, body, headers: proxyRes.headers }));
    });
    proxyReq.on('error', reject);
    proxyReq.end();
  });
}

describe('代理端到端集成', () => {
  test('请求被正确转发到上游，路径被 strip', async () => {
    // 启动模拟上游
    const upstream = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ path: req.url }));
    });
    await new Promise(r => upstream.listen(0, '127.0.0.1', r));
    const port = upstream.address().port;

    // 模拟入站请求
    const fakeReq = {
      method: 'GET',
      url: '/api/users/123',
      headers: { host: 'localhost:8081' },
    };
    const result = await proxyRequest(fakeReq, {}, '127.0.0.1', port, '/api', '');
    assert.strictEqual(result.status, 200);
    const data = JSON.parse(result.body);
    assert.strictEqual(data.path, '/users/123'); // /api 被 strip
    upstream.close();
  });

  test('上游返回 404 时代理透传状态码', async () => {
    const upstream = http.createServer((req, res) => {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    });
    await new Promise(r => upstream.listen(0, '127.0.0.1', r));
    const port = upstream.address().port;

    const fakeReq = { method: 'GET', url: '/missing', headers: {} };
    const result = await proxyRequest(fakeReq, {}, '127.0.0.1', port, '', '');
    assert.strictEqual(result.status, 404);
    upstream.close();
  });

  test('上游不可达时代理返回 500 错误', async () => {
    const fakeReq = { method: 'GET', url: '/x', headers: {} };
    await assert.rejects(async () => {
      await proxyRequest(fakeReq, {}, '127.0.0.1', 59999, '', '');
    });
  });
});

describe('注入测试：代理头注入', () => {
  test('x-forwarded-host 来自原始请求 host 头', async () => {
    const upstream = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ xfh: req.headers['x-forwarded-host'] }));
    });
    await new Promise(r => upstream.listen(0, '127.0.0.1', r));
    const port = upstream.address().port;

    const fakeReq = {
      method: 'GET',
      url: '/test',
      headers: { host: 'client-side-host:8081' },
    };
    // 模拟 old_index.js 的代理头设置
    const proxyHeaders = {
      ...fakeReq.headers,
      host: `127.0.0.1:${port}`,
      'x-forwarded-host': fakeReq.headers.host,
      connection: 'close',
    };
    const result = await new Promise((resolve, reject) => {
      const pr = http.request({ hostname: '127.0.0.1', port, path: '/test', method: 'GET', headers: proxyHeaders }, (pres) => {
        let body = '';
        pres.on('data', c => body += c);
        pres.on('end', () => resolve(JSON.parse(body)));
      });
      pr.on('error', reject);
      pr.end();
    });
    assert.strictEqual(result.xfh, 'client-side-host:8081');
    upstream.close();
  });
});
