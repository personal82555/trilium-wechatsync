#!/usr/bin/env node
/**
 * WechatSync 常驻桥接服务器
 *
 * 以 PRIMARY 模式持久运行，Chrome 扩展连一次即可永久在线。
 * 后续 wechatsync sync 命令自动识别为 SECONDARY 模式，通过本服务器转发请求。
 *
 * 原理：wechatsync CLI 内置 primary/secondary 双模式。
 * - PRIMARY: 启动 WebSocket 服务器 + HTTP API 服务器
 * - SECONDARY: 发现端口被占 → 通过 HTTP API 向 PRIMARY 转发
 *
 * 本脚本保持 PRIMARY 永不退出，扩展只需连接一次。
 *
 * 用法:
 *   node /vol1/1000/HD1/APP/hermes/scripts/wechatsync-server.mjs [port]
 *
 * 环境变量:
 *   SYNC_WS_PORT   - WebSocket 端口（默认 9600）
 *   WECHATSYNC_TOKEN - 安全令牌（需与扩展配置一致）
 */

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';

const PORT = parseInt(process.env.SYNC_WS_PORT || '9600', 10);
const HTTP_PORT = PORT + 1;
let tokenFromFile = '';
try { 
    const raw = readFileSync('/etc/wechatsync-token.conf', 'utf-8').trim();
    tokenFromFile = Buffer.from(raw, 'base64').toString('utf-8');
} catch(e) {}
const TOKEN = process.env.WECHATSYNC_TOKEN || tokenFromFile || '';

let client = null;          // Chrome 扩展的 WebSocket 连接
let pendingRequests = new Map();

// ========== WebSocket 服务器（给 Chrome 扩展连） ==========
const wss = new WebSocketServer({ port: PORT });

wss.on('listening', () => {
  console.error(`\n╔══════════════════════════════════════════════╗`);
  console.error(`║   WechatSync 常驻服务器                      ║`);
  console.error(`╠══════════════════════════════════════════════╣`);
  console.error(`║   WebSocket :${PORT}  ← 扩展连这里`);
  console.error(`║   HTTP API :${HTTP_PORT}  ← sync 自动转发`);
  console.error(`║                                             ║`);
  console.error(`║   请打开 Chrome 扩展 → 服务器地址:          ║`);
  console.error(`║   <你的NAS IP>:${PORT}`);
  if (TOKEN) {
    console.error(`║   Token: ${TOKEN.slice(0, 8)}...`);
  }
  console.error(`║                                             ║`);
  console.error(`║   连一次，永久不掉线 ✨                      ║`);
  console.error(`╚══════════════════════════════════════════════╝\n`);
});

wss.on('connection', (ws) => {
  console.error(`[Server] ✅ Chrome 扩展已连接！`);
  client = ws;

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      const pending = pendingRequests.get(msg.id);
      if (!pending) {
        // 可能是扩展主动发来的消息（非请求响应）
        console.error(`[Server] Unknown response id:`, msg.id);
        return;
      }
      clearTimeout(pending.timeout);
      pendingRequests.delete(msg.id);

      if (msg.error) {
        console.error(`[Server] ❌ Request ${msg.id} failed:`, msg.error.message || msg.error);
        pending.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      } else {
        console.error(`[Server] ✅ Request ${msg.id} completed`);
        pending.resolve(msg.result);
      }
    } catch (err) {
      console.error(`[Server] Failed to parse extension message:`, err.message);
    }
  });

  ws.on('close', () => {
    console.error(`[Server] ⚠️ Chrome 扩展断开连接`);
    client = null;
    // 拒绝所有待处理的请求
    for (const [id, pending] of pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Extension disconnected'));
    }
    pendingRequests.clear();
    // 清除心跳
    if (ws._keepAlive) clearInterval(ws._keepAlive);
  });

  ws.on('error', (err) => {
    console.error(`[Server] WebSocket error:`, err.message);
  });

  // 每 25 秒发心跳，防止扩展被 Chrome 休眠
  ws._keepAlive = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.ping();
    }
  }, 25000);
});

wss.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[Server] ❌ 端口 ${PORT} 已被占用！`);
    console.error(`[Server]    使用其他端口: SYNC_WS_PORT=9601 node wechatsync-server.mjs`);
    process.exit(1);
  }
  console.error(`[Server] WebSocket server error:`, err);
});

// ========== 请求转发 ==========
function sendRequest(method, params, token) {
  return new Promise((resolve, reject) => {
    if (!client) {
      reject(new Error('Chrome 扩展未连接'));
      return;
    }

    const id = `${Date.now()}-${randomUUID().slice(0, 8)}`;

    // 30分钟超时
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`请求超时: ${method}`));
    }, 30 * 60 * 1000);

    pendingRequests.set(id, { resolve, reject, timeout });

    client.send(JSON.stringify({ id, method, params, token }), (err) => {
      if (err) {
        clearTimeout(timeout);
        pendingRequests.delete(id);
        reject(err);
      }
    });
  });
}

// ========== HTTP API 服务器（sync 命令连这里转发） ==========
const httpServer = createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // 健康检查
  if (req.method === 'GET' && req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      connected: client !== null,
      mode: 'primary',
      uptime: process.uptime(),
    }));
    return;
  }

  // 请求转发
  if (req.method === 'POST' && req.url === '/request') {
    let body = '';
    req.on('data', (chunk) => body += chunk);
    req.on('end', async () => {
      try {
        const { method, params, token } = JSON.parse(body);
        console.error(`[Server] ▶️ 收到转发请求: ${method}${params?.platforms ? ' -> ' + params.platforms : ''}`);
        const result = await sendRequest(method, params, token || TOKEN);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ result }));
      } catch (error) {
        console.error(`[Server] ❌ 请求失败:`, error.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

httpServer.listen(HTTP_PORT, () => {
  console.error(`[Server] HTTP API ready on :${HTTP_PORT}`);
});

// ========== 进程管理 ==========
const shutdown = () => {
  console.error(`\n[Server] Shutting down...`);
  for (const [id, pending] of pendingRequests) {
    clearTimeout(pending.timeout);
    pending.reject(new Error('Server shutting down'));
  }
  pendingRequests.clear();
  wss.close();
  httpServer.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.stdin.resume();

// 定期检查
setInterval(() => {
  if (!client) {
    console.error(`[Server] ⏳ 等待 Chrome 扩展连接...`);
  }
}, 60000);
