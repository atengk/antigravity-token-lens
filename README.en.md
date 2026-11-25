# Token Lens (`token-lens`)

English | [简体中文](./README.md)

> A native, zero-patch, zero-build-dependency live Token & Context Diagnostics UI extension (Plugin + Sidecar) for **Google Antigravity (2.0 / IDE)**.

**Token Lens** docks into Antigravity's Auxiliary Pane (Aux Pane) to inspect context window utilization, `tokenBreakdown` composition, pure streaming throughput (`tok/s`), Time-To-First-Token (TTFT), cache hit rate & rebuild diagnostics, spawned subagent costs, and per-tool impact in real time.

---

## Key Features

- **100% Native & Non-Intrusive**: Built strictly on the official Antigravity Plugin + Sidecar specification (`SIDECAR_UI_ENTRYPOINT_AUX_PANE`). No client `app.asar` patches and no runtime DOM injection.
- **Zero Build & Zero External Dependencies**: Powered by native Node.js ESM on the backend and vanilla HTML5 + CSS Variables + SVG on the frontend. Automatically adapts to host light/dark themes and narrow sidebars (`< 360px`).
- **Dual-Source Collection & Anti-OOM Design**:
  - **Live RPC**: Connects to the local Language Server via Connect RPC, fetching trajectory deltas incrementally by offset and stripping heavy prompt/content text into a `16 MB`-capped LRU projection cache.
  - **Offline Fallback**: Gracefully falls back to local `transcript.jsonl` (tolerant of concurrent trailing partial-line writes) and Swarm `members.json` when disconnected or viewing archived chats.
- **Context Watermark & Runway Estimate**:
  - Live usage bar with configurable warning (`70%`) and critical (`85%`) thresholds, custom per-model/per-chat limit overrides, and one-click `/compact` copy.
  - Compact 4-segment summary bar (System Prompt / Custom & MCP Base / Tools / Chat Messages), average per-turn growth, and estimated turns remaining before reaching the critical threshold.
- **Account Quota & Burn-Rate Alerts**:
  - Real-time `5h` and `weekly` quota group tracking with active-pool highlighting, subscription tier, Prompt/Flow credits, and model deprecation/upgrade notices.
  - Compares cycle time elapsed vs. quota consumed (Pacing Indicator) and computes window-gated `Quota Burn Rate` and depletion ETA alerts from bounded 7-day sparse samples (`quota-history.json`).
- **Global Conversation Switcher & Concurrent Radar**:
  - Searchable header dropdown for switching across the 50 most recent conversations, with live indicators for concurrent background `RUNNING` sessions.
- **Background Availability Watchdog & Webhook Alerts**:
  - Passively monitors all non-archived conversations and subagents every `15s` and account quota/model status every `60s` from the Sidecar backend (establishes a silent baseline at startup—never replays historical failures).
  - Detects **region-blocked / `403` / `429` / auth errors** (immediate), **stuck retries** (`>= 3` attempts or `>= 60s`), **silent upstream hangs** (`>= 180s` waiting for first token, excluding `WAITING_FOR_USER` and local tool execution), **quota `0%` / disabled models**, and **Language Server disconnects** (`>= 30s`).
  - Built-in templates for **Feishu (HMAC sign), DingTalk (HMAC sign), WeCom, and Generic JSON Webhook**, using direct outbound delivery with 2 lightweight retries, `10m` per-fingerprint cooldown, `5s` burst aggregation, and `[Recovered]` alerts. Credentials are stored locally (`0o600`), masked in UI responses, stripped from JSON exports, and outbound payloads scrub local paths and secrets.
- **Pure Streaming Speed & TTFT Breakdown**:
  - Separates `timeToFirstToken` from `streamingDuration` alongside end-to-end (E2E) throughput and thinking vs. response output token splits.
  - Filters ultra-short burst outliers (`< 0.25s` or `< 20` tokens) out of peak calculations and chart scaling.
- **Cache Hit Trends & Rebuild Detection**:
  - Tracks cumulative and latest-turn hit rates, total tokens saved, and a 16-turn SVG hit-rate sparkline highlighting prefix cache rebuild drops.
- **Six Drill-Down Tabs**:
  - **Breakdown**: Human-readable labels for the top 10 heaviest steps (e.g. `#129 · read_file (app.js)`), plus all 8 native breakdown groups (`System Prompt`, `Rules`, `Skills`, `Subagents`, `Plugins`, `MCP Tools`, `Tools`, `Chat Messages`).
  - **Turns**: Filterable (`All / Rebuilt / Slow TTFT / Retried`) per-turn log with tool pills, latency, and cache metrics.
  - **Subagents**: Aggregates spawned subagent & Swarm costs with one-click drill-down inspection.
  - **Diagnostics**: Avg/P95 TTFT, cumulative wait/stream/tool durations, genuine API retry overhead, rules/customization budget usage, tool impact leaderboard, and one-click full JSON snapshot export.
  - **Quota**: Adaptive two-column quota rings, Pacing tracks, sparse trend sparklines, and per-group model availability status.
  - **Usage Stats**: Powered by a persistent incremental `usage-index.json` ledger with silent startup warmup—supports **Daily / Weekly / Monthly / Yearly** views, interactive bar charts, per-model distribution, and top parent-grouped conversations.

---

## Requirements

- **Google Antigravity** (Antigravity 2.0 desktop app or Antigravity IDE)
- **Node.js >= 20**

---

## Quick Installation

Antigravity automatically discovers plugins under `~/.gemini/config/plugins/`.

### Option 1: One-line `git clone` (Recommended)

**Windows CMD:**

```bat
git clone https://github.com/atengk/antigravity-token-lens.git "%USERPROFILE%\.gemini\config\plugins\token-lens"
```

**Windows PowerShell:**

```powershell
git clone https://github.com/atengk/antigravity-token-lens.git "$env:USERPROFILE\.gemini\config\plugins\token-lens"
```

> Note: Do not paste PowerShell variables (`$env:USERPROFILE` / `$HOME`) into Windows CMD, or CMD will create a literal folder named `$HOME`.

**macOS / Linux:**

```bash
git clone https://github.com/atengk/antigravity-token-lens.git ~/.gemini/config/plugins/token-lens
```

### Option 2: One-line Installer Script (Works even without Git)

**Windows PowerShell (run in PowerShell):**

```powershell
irm https://raw.githubusercontent.com/atengk/antigravity-token-lens/main/install.ps1 | iex
```

**macOS / Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/atengk/antigravity-token-lens/main/install.sh | bash
```

### Option 3: Local Clone + Installer

```bash
git clone https://github.com/atengk/antigravity-token-lens.git
cd antigravity-token-lens
# Windows: .\install.ps1
# macOS/Linux: ./install.sh
```

---

## Usage & Updating

1. After installation, type **`/token-lens`** in any Antigravity chat and click the sidecar pill to open the **Token Lens** Aux Pane.
2. Click the gear icon in the panel header to override context limits or adjust alert thresholds, or switch to the **Availability Alerts** tab (or click the top watchdog pill) to configure Webhook alert channels, test delivery, and inspect the latest `20` delivery logs.
   - **Activation note**: Open Token Lens once after restarting Antigravity to wake the background watchdog (it keeps running even when you switch tabs).
3. Click `EN` / `中文` to toggle UI language; JSON snapshot exports automatically omit watchdog channel configs.
4. To update, run `git pull --ff-only` inside `~/.gemini/config/plugins/token-lens` (or re-run the installer script) and toggle/reload the plugin on the `Customizations` page.

---

## Troubleshooting

- **Blank Aux Pane / `net::ERR_EMPTY_RESPONSE` on Windows**: If you use a system-wide proxy tool (such as **Proxifier**), make sure loopback hosts (`localhost; 127.0.0.1; 127.*; ::1`) are routed as **`Direct`** above any catch-all rule for `Antigravity.exe`.
- **Webhook delivery when VPN fails**: Outbound Webhook requests bypass proxy environment variables and connect directly by default. If your machine uses a full-device **TUN** tunnel and the VPN drops completely, add **`Direct`** bypass rules for your webhook hostnames (e.g. `open.feishu.cn`, `oapi.dingtalk.com`, `qyapi.weixin.qq.com`).

---

## Running Tests

```bash
node --test
```

---

## License

[MIT License](./LICENSE) © 2026 Ateng
