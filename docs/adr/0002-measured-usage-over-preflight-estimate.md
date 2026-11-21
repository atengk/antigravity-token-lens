---
status: accepted
---

# 上下文占用优先采信服务端实测输入（Measured Prompt Input）而非宿主发包前预估

Antigravity Language Server 会在请求发出前写入 `contextWindowMetadata.estimatedTokensUsed` 及 `tokenBreakdown`，但实测与模型提供商账单（`inputTokens + cacheReadTokens + cacheWriteTokens`）存在数千 Token 的双向偏差（例如首轮虚高 `+8.3K`、长会话偏低 `-2.4K`）。因此，Token Lens 在最新轮已返回非零 `usage` 时，将 `Context Used` 的真值来源切换为服务端实测输入；仅在请求生成中（`usage` 尚未回传）或缺失 `usage` 时回退到最新轮的 `estimatedTokensUsed`，同时保留 `tokenBreakdown` 原始比例不缩放，并直接暴露预估偏差 `Δ`。

## Considered Options

- **继续以 `estimatedTokensUsed` 为主水位**：界面数字与 `tokenBreakdown` 总和天然一致，但在短会话与中英混排工具调用场景下容易持续偏离模型真实计费窗口，误导用户对 `/compact` 时机的判断。
- **把最新回复 `responseOutputTokens` 累加进 `Context Used`**：虽然更接近“下轮静态下限”，但无法精确预测宿主下一轮如何裁剪思考块、折叠工具输出或重序列化消息，违背“零猜测”原则。
- **按比例强行缩放 `tokenBreakdown` 各项以凑平实测总值**：会把全局分词器偏差误摊到 System/Rules 等静态块上，反而掩盖真实的偏差来源。

## Consequences

- 已完成轮的 `Context Used` 与单轮上下文增长速率（`avgPerTurn`）将严格对齐服务端实测输入，不再因宿主本地预估抖动而失真；处于 `RUNNING` 空档期时，面板可平滑展示最新请求发包前的 `Host Pre-flight Estimate`，并在状态标识上区分 `实测` 与 `预估`。
- 主卡的 `Context Used` 与 `tokenBreakdown` 的 `totalTokens` 之间会存在一个显式可见的差值 `Δ`，界面需同步提示“构成明细为宿主本地预估”以消除用户困惑。
