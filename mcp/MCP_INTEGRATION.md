# MCP 协议集成

WechatSync 扩展支持 **MCP (Model Context Protocol)** 模式，允许任何 MCP 客户端（Hermes Agent、Claude Desktop、Cursor 等）直接调用同步发布功能。

## 架构

```
┌─────────────┐     MCP/stdio      ┌──────────────────┐     WebSocket     ┌─────────────┐
│ MCP Client  │ ◄──────────────► │  WechatSync MCP  │ ◄──────────────► │  Chrome     │
│ (Hermes /   │                   │  Server (扩展)    │                    │  扩展       │
│  Claude /   │                   │                   │                    │  (扫码登录)  │
│  Cursor)    │                   │  (localhost:???  )│                    │             │
└─────────────┘                   └──────────────────┘                    └─────────────┘
```

## 两种 MCP 方案

### 方案 A：WechatSync 扩展内置 MCP Server（推荐）

WechatSync 扩展自带 MCP Server 模式。

**设置：**
1. 打开 Chrome WechatSync 扩展
2. 选择模式：**「CLI / MCP Server」**
3. 保持扩展弹窗打开

**MCP 客户端配置：**

```json
{
  "mcpServers": {
    "wechatsync": {
      "command": "wechatsync",
      "args": ["mcp"],
      "env": {
        "SYNC_WS_PORT": "9600"
      }
    }
  }
}
```

#### Hermes Agent 配置

在 `~/.hermes/config.yaml` 中添加：

```yaml
mcp_servers:
   wechatsync:
     command: wechatsync
     args: [mcp]
     env:
       SYNC_WS_PORT: "9600"
```

然后使用 `native-mcp` skill 连接即可。

#### Claude Desktop 配置

在 `claude_desktop_config.json` 中添加：

```json
{
  "mcpServers": {
    "wechatsync": {
      "command": "wechatsync",
      "args": ["mcp"],
      "env": {
        "SYNC_WS_PORT": "9600"
      }
    }
  }
}
```

### 方案 B：通过桥接转发（生产环境）

配合本项目的桥接服务，MCP 请求通过桥接转发到 Chrome 扩展。

```
MCP Client → Bridge WS:9600 → Chrome 扩展 → 发布到平台
```

**Hermes Agent 桥接模式：**

```yaml
mcp_servers:
   wechatsync:
     command: wechatsync
     args: [mcp]
     env:
       SYNC_WS_PORT: "9600"       # 桥接 WebSocket 端口
       WECHATSYNC_BRIDGE: "true"   # 启用桥接转发模式
```

## MCP 可用工具

连接成功后，MCP 客户端可获得以下工具：

| 工具名 | 说明 | 参数 |
|--------|------|------|
| `sync_article` | 同步文章到平台 | `file`(路径), `platforms`(逗号分隔), `title`(可选) |
| `get_platforms` | 获取已登录平台列表 | 无 |
| `get_status` | 获取扩展状态 | 无 |

## 示例：Hermes Agent 调用

```
# 同步文章到公众号和知乎
wechatsync sync /path/to/article.md --platforms weixin,zhihu

# 通过 MCP 工具
/skill native-mcp
然后调用 sync_article 工具
```

## 注意事项

1. **Chrome 扩展必须保持打开**（或使用 Keep Alive 功能）
2. MCP Server 模式与 WebSocket 模式互斥，不能同时启用
3. 扫码登录态有效期为数天，过期后需重新扫码
4. 若使用桥接转发，需先启动桥接服务（见 `bridge/` 目录）
