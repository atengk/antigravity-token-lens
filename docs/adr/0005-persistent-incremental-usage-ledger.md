---
status: accepted
---

# 全量周期统计采用基于本地轨迹的持久化增量账本（`usage-index.json`），支持静默预热与防丢保留

Antigravity Language Server 的 `GetAllCascadeTrajectories` 仅保留近期少数活跃会话摘要且不含历史 Token 明细，无法支撑 `每日 / 每周 / 每月 / 每年` 的跨全年 `Time-Bucketed Usage` 统计；而全量重扫本机 `brain/*/transcript.jsonl`（数百会话、数百 MB）冷扫耗时超过 1 秒。因此，Token Lens 在 `sidecar_data` 维护单文件原子覆写的 `usage-index.json` 持久化 `Usage Ledger`：首次启动延迟静默预热，后续仅依据文件 `mtimeMs` 与 `size` 增量解析发生变化的活跃会话（大文件采用流式逐行扫描防 OOM），按每条 `PLANNER_RESPONSE` 的 `created_at` 精确落入本地自然日桶；即使未来旧会话目录被宿主清理，已入账的历史统计记录依然保留。

## Considered Options

- **仅统计 LS 在线 `GetAllCascadeTrajectories` 返回的会话**：只能覆盖近期几天内的少数轨迹，换机器或重启宿主后早期记录立即消失，无法满足周/月/年统计需求。
- **每次打开「用量统计」Tab 时全盘重扫所有 `transcript.jsonl`**：数百个文件并发读取与 JSON 解析会带来秒级延迟与高内存波动。
- **按会话创建时间将整包消耗归入单日**：跨越多天的长会话会把全部消耗错算到创建当天，扭曲每日趋势与周/月对比。

## Consequences

- 冷启动后历史会话查询直接命中持久化索引（`< 5ms`），兼顾秒开体验与全年可追溯性；每个 `brain/<uuid>` 独立入账自身 `PLANNER_RESPONSE`，天然包含所有主会话与派生子代理且绝不重复计算。
- 本地 `transcript.jsonl` 仅记录 `input_tokens`、`cache_read_tokens` 与 `output_tokens`，不包含在线 RPC 账单中的 `cache_write_tokens` 与重试消耗（`retryInfos`），界面需显式标注该账本口径边界。
