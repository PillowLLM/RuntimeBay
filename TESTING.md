# RuntimeBay 测试说明
- 测试完成：是（2026-10-04）
- 测试日期：2026-10-04
- 测试内容：单元测试覆盖 utils/logger.js（createLogger/降级行为）、Router 配置解析（port/路由/错误页/最长前缀匹配）、路径重写逻辑；注入测试覆盖路径穿越、代理头注入、前缀匹配防护；钩子测试覆盖 logger 实例隔离、状态码透传；集成测试覆盖 HTTP 代理端到端转发与错误处理
- 运行命令：npm test
- 测试框架：node:test（Node.js 内置测试运行器）
- 模型：豆包（Doubao）生成

## 测试目录

| 文件 | 说明 |
|------|------|
| `tests/logger.test.js` | 日志模块降级行为（服务不可用时不崩溃） |
| `tests/router-config.test.js` | Router 配置解析、最长前缀匹配、路径穿越防护 |
| `tests/integration.test.js` | 代理端到端转发、错误透传、代理头注入测试 |

## 运行方式

```bash
npm test
```

## 覆盖说明

### 单元测试（8 个）
- logger：createLogger 返回四方法、服务不可用时静默降级不抛异常
- router 配置：port/路由/错误页解析、无端口默认 80、空行忽略
- 路径重写：stripPath 去前缀、targetPath 拼接、非匹配路径不变

### 注入测试（3 个）
- 路径穿越 `../` 不匹配任何路由前缀
- 代理头 x-forwarded-host 透传原始 host 头
- 最长前缀匹配防止 `/api/v1` 被 `/api` 错误拦截

### 钩子/交互测试（3 个）
- logger 不同模块名产生独立实例
- 上游 404 状态码透传
- 上游不可达时代理错误处理

### 集成测试（2 个）
- 请求正确转发到上游并 strip 前缀
- 上游返回 500 时代理错误处理

## 预期结果：16 个用例全部通过
