---
status: accepted
---

# 默认上下文参考上限采用宿主有效上限（Host Effective Limit）

在 Antigravity 运行时中，底层模型（如 Gemini 4 系列、Gemini 3.8 Flash、Claude 5.5 系列）的原生 API 上下文窗口可达 1M tokens（`1,048,576` 或 `1,000,000`），但实测 Antigravity Language Server 的 `contextWindowMetadata.maxContextTokens` 与平台文档均将集成模型的运行时窗口与自动检查点上限设定为 `512,000` tokens。因此，当在线首轮尚未返回宿主元数据或处于离线 `transcript.jsonl` 兜底模式时，Token Lens 的内置默认参考上限统一以 Antigravity 宿主有效上限（`512,000`；GPT-OSS 120B 为 `131,072`）为准，而非模型原生理论上限。

## Considered Options

- **采用模型原生上下文窗口（1M）**：会导致离线兜底或切换档位时显示“512K 窗口仅用 50%”的虚低水位，使用户错过 `/compact` 压缩预警时机，且与在线时宿主上报的 `512,000` 发生跳变。
- **采用宿主有效上限（512K）**：与 Antigravity 实际压缩/截断行为及在线 `maxContextTokens` 保持一致；若未来宿主上调某模型限额，在线模式会自动优先采信 `hostMaxTokens`，用户也可通过 `Context Limit Override` 自行覆盖。

## Consequences

- `MODEL_DEFAULT_LIMITS` 中的 `512_000` 仅代表 Antigravity 宿主侧的默认兜底口径，并非否定模型自身的 1M 原生能力；后续新增模型若在 Antigravity 中实测突破 512K，需同步更新其静态兜底值。
- 未来若插件适配非 Antigravity 的其他宿主或原生直连 API，需要按宿主维度隔离参考上限表，而不能直接复用同一份静态常量。
