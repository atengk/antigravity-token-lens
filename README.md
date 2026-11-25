# Token Lens (`token-lens`)

[English](./README.en.md) | 简体中文

> 面向 **Google Antigravity (2.0 / IDE)** 的纯原生、零客户端篡改、零构建依赖的实时 Token 与上下文诊断 UI 插件（Plugin + Sidecar）。

**Token Lens** 直接挂载在 Antigravity 右侧辅助面板（Aux Pane）中，实时透视当前会话及派生子代理的上下文水位、构成拆解（`tokenBreakdown`）、纯流式生成速率（`tok/s`）、首字延迟（TTFT）、缓存命中与断崖重建诊断，以及工具调用开销排行。

---

## 核心特性

- **纯原生零侵入**：严格遵循 Antigravity Plugin + Sidecar 规范，不修改客户端 `app.asar`，不注入宿主 DOM，免疫版本升级破坏。
- **零外部构建依赖**：后端基于原生 Node.js ESM（`node:http` / `node:fs` / `node:child_process`），前端基于原生 HTML5 + CSS Variables + SVG，自适应宿主亮/暗主题与 `< 360px` 窄侧边栏。
- **双源采集与防 OOM 防护**：
  - **主通道（Live RPC）**：直连本机 Language Server Trajectory Connect RPC，按偏移量增量拉取并实时剥离大段文本字段，内存仅保留不超过 `16 MB` 的统计投影 LRU 缓存，绝不产生磁盘账本膨胀。
  - **离线兜底（Transcript）**：当宿主断连或查看归档历史会话时，自动降级读取本地 `transcript.jsonl`（容忍并发写入末尾半行截断）与 Swarm `members.json`。
- **上下文水位与续航预估**：
  - 实时进度条 + 三级预警（默认注意 `70%` / 预警 `85%`，可自定义模型上限与阈值），高水位一键复制 `/compact`。
  - 首屏展示 4 大紧凑分段（系统指令 / 定制与 MCP 底座 / 内置工具 / 对话消息）、最近轮均净增长量及距压缩线预计剩余轮数。
- **账号级配额与消耗预警**：
  - 在线实时对接模型组 `5h` 与 `weekly` 双窗口配额，顶部脉冲条自动高亮当前会话所属配额组，支持订阅等级、Prompt/Flow 积分与官方模型停用/升级公告展示。
  - 同屏对比“周期时间进度 vs 额度已耗比例”（Pacing），基于有界 7 天稀疏持久化采样（`quota-history.json`）按分窗口门槛测算实测消耗速率与重置前撞墙预警（ETA）。
- **全局会话切换与并发雷达**：
  - 顶部支持下拉搜索切换最近 50 条主会话，自动发现并提示后台并发 `RUNNING` 会话，一键跳转排查消耗来源。
- **后台可用性巡检与 Webhook 告警（Availability Watchdog）**：
  - Sidecar 后台每 `15s` 被动观测全局非归档任务与子代理、每 `60s` 检查账号配额与模型状态（启动首次扫描静默建立基线，绝不翻历史旧账）。
  - 精准识别 **VPN 节点地区不可用 / `403` / `429` / 鉴权失效**（立即推送）、**连续重试卡死**（默认 `>= 3` 次或 `>= 60s`）、**上游等待首字静默挂起**（默认 `>= 180s`，严格排除等待用户确认与本地工具执行）、**配额归零 / 模型禁用** 与 **Language Server 失联**（`>= 30s`）。
  - 内置 **飞书（HMAC 加签）、钉钉（HMAC 加签）、企业微信、通用 JSON Webhook**，采用直连外发 + 失败退避重试 `2` 次，支持 `10` 分钟同指纹冷却、`5s` 短窗突发合并及 `[已恢复]` 通知；凭据本地 `0o600` 隔离存储、UI 掩码回显、导出快照彻底剥离，外发文案自动脱敏本机路径与密钥。
- **纯流式速率与 TTFT 拆解**：
  - 将 `timeToFirstToken`（首字延迟）与 `streamingDuration`（纯流式吐字时长）严格拆分计算，同步给出端到端速率（E2E）与思考/正文 Token 分拆。
  - 自动过滤 `< 0.25s` 或 `< 20 tok` 的超短脉冲毛刺，防止畸高单步峰值污染均值与 16 轮柱状趋势图。
- **缓存命中率与断崖重建诊断**：
  - 展示累计命中率、最新一轮命中率、命中省下的 Token 数与近 16 轮命中率 SVG 柱状趋势图。
  - 自动识别前缀缓存失效/模型切换导致的**缓存重建**轮次并高亮标记。
- **六大深度下钻视图**：
  - **上下文构成**：按步骤索引关联工具与操作短标签（如 `#129 · read_file (app.js)`），展示 Top 10 最占上下文的步骤，完整展开 8 大原生分组（系统指令 / Rules / Skills / 子代理定义 / 扩展插件 / MCP 工具 / 内置工具 / 对话消息）。
  - **逐轮明细**：支持按 `全部 / 缓存重建 / 慢首字 (>5s) / 含重试` 筛选，展示每轮关联工具标签、耗时、缓存命中与输出拆解。
  - **子代理**：自动聚合所有派生子代理与 Swarm 成员消耗，支持一键下钻切换查看任意子代理视角。
  - **工具与诊断**：统计平均 / P95 TTFT、首字等待/生成/工具累计耗时、真实 API 重试消耗、规则/定制预算水位、工具消耗排行榜及一键复制 JSON 完整快照。
  - **配额用量**：双栏大屏展示各配额组环形余量、Pacing 双轨对比、消耗趋势折线图与组内模型清单。
  - **用量统计**：基于增量持久化全量用量账本（`usage-index.json` + 启动静默预热），支持 **日 / 周 / 月 / 年** 四档切换、交互式趋势柱状图、按模型分布及主会话归并 Top 榜单（点击直达详情）。

---

## 环境要求

- **Google Antigravity**（Antigravity 2.0 桌面端或 Antigravity IDE）
- **Node.js >= 20**（Sidecar 运行时所需，推荐 LTS）

---

## 快速安装（其他电脑开箱即用）

Antigravity 会自动发现 `~/.gemini/config/plugins/` 下的插件，因此只需将本仓库放入 `~/.gemini/config/plugins/token-lens` 即可生效。

### 方式一：单行 `git clone` 安装（推荐，方便后续 `git pull` 更新）

**Windows CMD（命令提示符）：**

```bat
git clone https://github.com/atengk/antigravity-token-lens.git "%USERPROFILE%\.gemini\config\plugins\token-lens"
```

**Windows PowerShell：**

```powershell
git clone https://github.com/atengk/antigravity-token-lens.git "$env:USERPROFILE\.gemini\config\plugins\token-lens"
```

> 注意：请勿把 PowerShell 的 `$env:USERPROFILE` 或 `$HOME` 变量直接粘贴到 CMD 中执行，否则 CMD 会将其当作字面文件夹名创建。

**macOS / Linux：**

```bash
git clone https://github.com/atengk/antigravity-token-lens.git ~/.gemini/config/plugins/token-lens
```

### 方式二：一键脚本安装 / 更新（支持无 Git 环境自动下载压缩包）

**Windows PowerShell（请在 PowerShell 中执行）：**

```powershell
irm https://raw.githubusercontent.com/atengk/antigravity-token-lens/main/install.ps1 | iex
```

**macOS / Linux：**

```bash
curl -fsSL https://raw.githubusercontent.com/atengk/antigravity-token-lens/main/install.sh | bash
```

### 方式三：手动克隆到本地后安装

```bash
git clone https://github.com/atengk/antigravity-token-lens.git
cd antigravity-token-lens
# Windows 执行: .\install.ps1
# macOS/Linux 执行: ./install.sh
```

---

## 使用与更新

1. 安装完成后，在 Antigravity 任意对话窗口中输入 **`/token-lens`** 并发送，点击回答中的 **`打开 Token Lens 实时面板`** 胶囊即可在右侧 Aux Pane 打开看板（也可在侧边栏 `Customizations` 页面确认插件已启用）。
2. **自定义上下文上限与预警线**：点击面板右上角齿轮图标，可按模型或当前会话覆盖上下文上限（如 `128K`、`200K`、`512K`、`1M`、`2M`）及注意/预警百分比，偏好配置自动原子持久化。
3. **配置可用性巡检与告警通知**：点击顶部巡检状态胶囊或右上角齿轮图标切换至 **「可用性巡检与通知」** 页签，添加飞书 / 钉钉 / 企业微信 / 通用 Webhook 通道并点击 **「测试此通道」** 即可验证推送，同时支持查看最近 `20` 条告警与投递回执流水。
   - **激活说明**：每次重启 Antigravity 后打开一次 Token Lens 面板即可唤醒后台巡检，激活后即使切走面板标签页仍可持续在后台监控。
4. **切换中/英文**：点击面板右上角 `EN` / `中文` 一键切换，支持一键复制 Markdown 诊断摘要或导出完整 JSON 快照（导出内容已自动剔除告警通道配置）。
5. **更新插件**：
   - 若通过方式一直接克隆到插件目录，进入 `~/.gemini/config/plugins/token-lens` 执行 `git pull --ff-only` 即可；
   - 或直接重新执行方式二的一键脚本，在 `Customizations` 页面重载开关或重启面板即可加载最新版本。
6. **卸载插件**：在 Antigravity 的 `Customizations` 页面关闭/卸载，或直接删除 `~/.gemini/config/plugins/token-lens` 目录。

---

## 常见问题排查

### 1. Windows 下打开面板显示白屏或 `net::ERR_EMPTY_RESPONSE`

如果本机启用了全局代理工具（如 **Proxifier**、Clash TUN/系统代理等），请检查是否把 `Antigravity.exe` 对本地回环地址（`localhost` / `127.0.0.1`）的请求也转发到了代理端口。
- **解决方法**（以 Proxifier 为例）：在规则列表**最顶部**新增一条直连规则，目标主机填写 `localhost; 127.0.0.1; 127.*; ::1`，动作选择 **`Direct`**。

### 2. VPN 节点异常时如何保证 Webhook 告警正常送达

Token Lens 外发 Webhook 默认直连请求（不主动跟随 `HTTP_PROXY` 系统代理环境变量），以便在代理节点故障时仍可把消息送达飞书 / 钉钉 / 企业微信等国内服务。若本机启用了 **TUN 全局接管** 模式且整个 VPN 链路中断，建议在代理规则中将通知平台域名（如 `open.feishu.cn`、`oapi.dingtalk.com`、`qyapi.weixin.qq.com`）设为 **`Direct`** 直连放行。

### 3. 如何验证安装与插件状态

在仓库或插件根目录运行内建单元测试（零外部依赖）：

```bash
node --test
```

---

## 目录结构

```text
antigravity-token-lens/
├── plugin.json                        # Antigravity 插件清单
├── CONTEXT.md                         # 核心领域术语表
├── docs/
│   └── adr/                           # 架构决策记录（ADR-0001 ~ 0006）
├── install.ps1                        # Windows 一键安装 / 更新脚本
├── install.sh                         # macOS / Linux 一键安装 / 更新脚本
├── assets/
│   └── logo.svg                       # 双主题高对比矢量图标
├── skills/
│   └── token-lens/
│       └── SKILL.md                   # /token-lens 快捷唤起技能
└── sidecars/
    └── panel/
        ├── sidecar.json               # Aux Pane Sidecar 描述文件
        ├── package.json               # Node ESM 声明
        ├── main.mjs                   # SidecarApp 启动器与 HTTP API 服务
        ├── ls-client.mjs              # Language Server RPC 增量客户端与 LRU 缓存
        ├── watchdog.mjs               # 后台可用性巡检状态机与聚合冷却引擎
        ├── notifier.mjs               # 多平台 Webhook 签名投递与路径/密钥脱敏
        ├── quota.mjs                  # 账号配额稀疏采样存储与速率预警分析引擎
        ├── usage-ledger.mjs           # 持久化增量全量用量账本与日/周/月/年聚合
        ├── transcript.mjs             # transcript.jsonl 与 Swarm 离线兜底读取
        ├── metrics.mjs                # 指标归一化、速率/缓存/工具诊断引擎
        ├── store.mjs                  # 轻量偏好存储、通道掩码隔离与宿主主题同步
        ├── index.html                 # 原生 HTML5 面板骨架
        ├── styles.css                 # 响应式样式与主题变量自适应
        ├── app.js                     # 前端交互、SVG 趋势图与视角钻取
        └── tests/                     # Node 原生单元测试套件
```

---

## License

[MIT License](./LICENSE) © 2026 Ateng
