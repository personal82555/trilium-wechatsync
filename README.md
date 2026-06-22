# TriliumNext × WechatSync Publisher Bridge

![License](https://img.shields.io/github/license/jinghui1984/trilium-wechatsync)
[![GitHub stars](https://img.shields.io/github/stars/jinghui1984/trilium-wechatsync)](https://github.com/jinghui1984/trilium-wechatsync/stargazers)

> 让 TriliumNext 笔记一键发布到微信公众号、知乎、CSDN、什么值得买、掘金等 20+ 中文自媒体平台的桥接系统。
> 
**操作三步预览图：**
> 

<img width="698" height="343" alt="1" src="https://github.com/user-attachments/assets/5b60ae6d-df51-48cc-a80c-dcb946d7ead4" />
<img width="652" height="675" alt="2" src="https://github.com/user-attachments/assets/fd278e44-8a9e-422b-9823-240a2d382ce5" />
<img width="683" height="351" alt="3" src="https://github.com/user-attachments/assets/bb402d7f-926f-4863-91e5-00445dc25f4b" />


## ✨ 功能

- ✅ **一键发布** — 从 TriliumNext 发布控制台选择文章 → 选平台 → 发布
- ✅ **草稿编辑链接** — 发布成功后返回各平台的编辑地址，直接点击修改
- ✅ **实时状态** — 顶部显示 🟢 同步助手在线 / 🟡 扩展未连接 / 🔴 桥接离线
- ✅ **重试机制** — 扩展短暂断连自动重试，无需手动干预
- ✅ **智能 URL 提取** — 自动过滤图片链接，提取正确的草稿编辑链接
- ✅ **心跳保活** — 桥接每 25 秒发送 ping 保持 WebSocket 连接
- ✅ **20+ 平台** — 微信公众号、知乎、CSDN、掘金、什么值得买、头条、简书等
- ✅ **MCP 协议** — 支持通过 MCP 工具调用发布（Hermes Agent / Claude Desktop）
- ✅ **开机自启** — systemd 服务管理，崩溃自动恢复

## 🏗️ 架构

```
┌────────────────────────────────────────────────────────────────────┐
│                      TriliumNext Server                            │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  /api/publisher/publish       发布触发                      │   │
│  │  /api/publisher/status        桥接状态                      │   │
│  │  /api/publisher/platforms     平台列表                      │   │
│  │  wechatsync.ts → execSync → wechatsync sync file.md         │   │
│  └────────────┬───────────────────────────────────────────────┘   │
│               │                                                    │
│  publish.html │  发布控制台前端                                     │
│  ├─ 🟢 状态头 │  ← 实时检测桥接 + 扩展连接                         │
│  ├─ 加载笔记  │  ← 输入 noteId                                     │
│  ├─ 选择平台  │  ← 勾选目标平台                                    │
│  └─ 结果表格  │  ← ✏️ 编辑草稿链接可直接点击                       │
└──────────────┼─────────────────────────────────────────────────────┘
               │
               ▼ HTTP :9601/request
    ┌──────────────────────────────────────┐
    │     WechatSync Bridge Server         │  systemd 管理
    │     (wechatsync-server.mjs)          │  Restart=always
    │                                      │
    │  WebSocket :9600  ◄──────────────┐   │
    │  HTTP API   :9601  ────┐         │   │
    └────────────────────────┤─────────┘   │
                             │             │
                    ┌────────┘             │
                    ▼                      │
    ┌──────────────────────────┐  ┌────────┴────────┐
    │  wechatsync sync  CLI    │  │  Chrome 扩展    │
    │  (secondary mode)        │  │  (扫码登录)     │
    │  → 自动检测桥接转发      │  │  → WebSocket    │
    └──────────────────────────┘  └─────────────────┘
                                           │
                                    ┌──────┴──────┐
                                    │  各平台 API  │
                                    │ 公众号/知乎/  │
                                    │ CSDN/掘金/   │
                                    │ 值得买/头条  │
                                    └─────────────┘
```

## 📦 项目结构

```
trilium-wechatsync/
├── bridge/                          # 桥接服务（独立运行，无需 Trilium）
│   ├── wechatsync-server.mjs        # 桥接服务器主程序
│   ├── wechatsync-bridge.service    # systemd 服务文件
│   └── wechatsync-bridge-wrapper.sh # 启动包装脚本
├── patch/                           # TriliumNext 补丁
│   ├── patch.sh                     # 一键补丁脚本
│   ├── wechatsync.ts                # 完整发布器实现
│   ├── publisher_frontend.ts        # API 端点（含状态）
│   └── publish.html                 # 发布控制台前端
├── mcp/
│   └── MCP_INTEGRATION.md           # MCP 协议集成文档
├── docs/
│   └── screenshots/                 # 截图（使用中）
├── install.sh                       # 一键安装桥接
└── README.md
```

## 🚀 快速开始

### 前置要求

| 组件 | 版本要求 |
|------|----------|
| TriliumNext | ≥ v0.92 |
| Node.js | ≥ 18 |
| Chrome | 最新（安装 WechatSync 扩展） |
| wechatsync CLI | `npm install -g wechatsync-cli` |

### 第一步：安装桥接服务

```bash
# 克隆仓库（或在服务器上直接运行）
git clone https://github.com/jinghui1984/trilium-wechatsync.git
cd trilium-wechatsync

# 一键安装桥接
chmod +x install.sh
sudo ./install.sh
```

脚本会：
1. 复制桥接服务器到 `/usr/local/share/wechatsync-bridge/`
2. 安装 systemd 服务 `wechatsync-bridge.service`
3. 生成 Token 保存在 `/etc/wechatsync-token.conf`
4. 启动桥接并设为开机自启

### 第二步：应用 TriliumNext 补丁

```bash
# 确保你知道 TriliumNext 的安装路径（默认 /opt/trilium）
cd trilium-wechatsync
chmod +x patch/patch.sh
./patch/patch.sh /path/to/trilium

# 重启 TriliumNext
sudo systemctl restart triliumnext
```

### 第三步：配置 Chrome 扩展

1. 在 Chrome 安装 **WechatSync 扩展**
2. 点击扩展图标 → **设置**
3. 选择 **「WebSocket」模式**
4. 填写：

   | 字段 | 值 |
   |------|-----|
   | 服务器地址 | `ws://你的服务器IP:9600` |
   | Token | 复制 `/etc/wechatsync-token.conf` 中的内容（用 `cat` 查看） |

5. 点击 **连接**

扩展应显示「已连接」。

### 第四步：验证

1. 打开 TriliumNext → 访问 `http://你的TRILIUM:8083/publish`
2. 登录后标题栏应显示 **🟢 同步助手在线**
3. 输入文章 noteId → 选择平台 → 发布
4. 结果表格显示各平台 **✏️ 编辑草稿** 链接

## 🎯 支持的平台

插件通过 WechatSync 扩展发布到以下平台：

| 平台 | 标识 | 说明 |
|------|------|------|
| 微信公众号 | `weixin` | 草稿箱编辑链接 |
| 知乎 | `zhihu` | 专栏文章编辑 |
| CSDN | `csdn` | 博客编辑 |
| 掘金 | `juejin` | 文章编辑 |
| 什么值得买 | `smzdm` | 好文编辑 |
| 头条号 | `toutiao` | 图文编辑 |
| 简书 | `jianshu` | 文章编辑 |
| 微博 | `weibo` | 头条文章 |
| 小红书 | `xiaohongshu` | 笔记编辑 |
| SegmentFault | `segmentfault` | 文章编辑 |
| 哔哩哔哩 | `bilibili` | 专栏 |
| 雪球 | `xueqiu` | 文章 |
| 语雀 | `yuque` | 文档 |
| 豆瓣 | `douban` | 日记 |
| 思否 | `sifou` | 文章 |

> 完整支持列表见 WechatSync 扩展文档。

## 🔌 状态指示器说明

发布控制台顶部实时显示桥接状态：

| 图标 | 含义 | 操作 |
|------|------|------|
| 🟢 同步助手在线 | 桥接运行中，扩展已连接 | 直接发布 |
| 🟡 扩展未连接 · 点此设置 | 桥接在但扩展断连 | 检查 Chrome 扩展 / 点开设置指引 |
| 🔴 桥接离线 · 点此修复 | 桥接服务未运行 | 检查 `systemctl status wechatsync-bridge` |

## 🛠️ 管理命令

```bash
# 桥接服务管理
sudo systemctl start wechatsync-bridge    # 启动
sudo systemctl stop wechatsync-bridge     # 停止
sudo systemctl restart wechatsync-bridge  # 重启
sudo systemctl status wechatsync-bridge   # 查看状态
sudo journalctl -u wechatsync-bridge -f   # 实时日志

# 查看 Token
sudo cat /etc/wechatsync-token.conf | base64 -d

# 更新 Token
echo -n "你的新token" | base64 | sudo tee /etc/wechatsync-token.conf
sudo systemctl restart wechatsync-bridge
```

## 🔒 Token 认证

桥接使用 Token 认证保护 API 请求：

- Token 以 **base64** 编码存储在 `/etc/wechatsync-token.conf`
- 桥接启动时自动解码并设置环境变量
- Chrome 扩展和 API 请求需要携带相同 Token
- 默认 Token 在安装时随机生成

## 🔄 MCP 协议集成

详情见 [MCP 集成文档](mcp/MCP_INTEGRATION.md)。

## 🐛 常见问题

### Q: 扩展显示「等待连接」

**原因**：扩展处于本地 CLI/MCP Server 模式，未配置为 WebSocket 客户端模式。

**解决**：在扩展设置中选择「WebSocket」模式，填入服务器地址。

### Q: 发布后「未检测到返回的 URL」

**原因**：
1. CLI 命令包含 `--dry-run`（旧版本）
2. 扩展在发布过程中断连
3. 扩展尚未扫码登录平台

**解决**：
1. 确保补丁已应用（最新版本已移除 `--dry-run`）
2. F5 刷新发布页面确认 🟢 状态
3. 打开扩展检查各平台登录状态

### Q: 扩展频繁断连

**原因**：Chrome 后台节流导致 WebSocket 中断。

**解决**：
- 保持扩展弹窗打开
- 或开启扩展的「保持后台连接」(Keep Alive) 功能
- 桥接已内置 25 秒心跳 ping

### Q: 桥接启动失败

```bash
# 查看错误日志
sudo journalctl -u wechatsync-bridge -n 20

# 检查端口冲突
sudo ss -tlnp | grep -E "960[01]"
```

## 📝 License

MIT

## 🤝 贡献

欢迎提交 Issue 和 PR！

## 🙏 致谢

- [WechatSync](https://github.com/wechatsync/WechatSync) — Chrome 扩展核心
- [TriliumNext](https://github.com/TriliumNext/Notes) — 笔记系统基座
