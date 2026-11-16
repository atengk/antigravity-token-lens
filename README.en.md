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
  - Shows System Prompt / Tools / Chat Messages breakdown, average per-turn growth, and estimated turns remaining before reaching the critical threshold.
- **Pure Streaming Speed & TTFT Breakdown**:
  - Separates `timeToFirstToken` from `streamingDuration` alongside end-to-end (E2E) throughput and thinking vs. response output token splits.
  - Filters ultra-short burst outliers (`< 0.25s` or `< 20` tokens) out of peak calculations and chart scaling.
- **Cache Hit Trends & Rebuild Detection**:
  - Tracks cumulative and latest-turn hit rates, total tokens saved, and a 16-turn SVG hit-rate sparkline highlighting prefix cache rebuild drops.
- **Four Drill-Down Tabs**:
  - **Breakdown**: Human-readable labels for the top 10 heaviest steps (e.g. `#129 · read_file (app.js)`), plus expandable System Prompt / Tools groups.
  - **Turns**: Filterable (`All / Rebuilt / Slow TTFT / Retried`) per-turn log with tool pills, latency, and cache metrics.
  - **Subagents**: Aggregates spawned subagent & Swarm costs with one-click drill-down inspection.
  - **Diagnostics**: Avg/P95 TTFT, cumulative wait/stream/tool durations, genuine API retry overhead, rules/customization budget usage, tool impact leaderboard, and one-click full JSON snapshot export.

---

## Requirements

- **Google Antigravity** (Antigravity 2.0 desktop app or Antigravity IDE)
- **Node.js >= 20**

---

## Quick Installation

Antigravity automatically discovers plugins under `~/.gemini/config/plugins/`.

### Option 1: One-line `git clone` (Recommended)

**Windows PowerShell:**

```powershell
git clone https://github.com/atengk/antigravity-token-lens.git "$HOME\.gemini\config\plugins\token-lens"
```

**macOS / Linux:**

```bash
git clone https://github.com/atengk/antigravity-token-lens.git ~/.gemini/config/plugins/token-lens
```

### Option 2: One-line Installer Script (Works even without Git)

**Windows PowerShell:**

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
2. Click the gear icon in the panel header to override context limits or adjust alert thresholds, or click `EN` / `中文` to toggle UI language.
3. To update, run `git pull --ff-only` inside `~/.gemini/config/plugins/token-lens` (or re-run the installer script) and toggle/reload the plugin on the `Customizations` page.

---

## Troubleshooting

- **Blank Aux Pane / `net::ERR_EMPTY_RESPONSE` on Windows**: If you use a system-wide proxy tool (such as **Proxifier**), make sure loopback hosts (`localhost; 127.0.0.1; 127.*; ::1`) are routed as **`Direct`** above any catch-all rule for `Antigravity.exe`.

---

## Running Tests

```bash
node --test sidecars/panel/tests/*.test.mjs
```

---

## License

[MIT License](./LICENSE) © 2026 Ateng
