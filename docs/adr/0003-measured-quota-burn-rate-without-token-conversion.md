---
status: accepted
---

# 配额消耗速率严格基于剩余比例同周期实测差分，禁止伪造 Token 换算系数

Antigravity Language Server 的 `RetrieveUserQuotaSummary` 仅以全账号维度返回各 `Quota Bucket` 的高精度 `Remaining Fraction`（精确至 7 位小数）及 `Reset Time`，并在官方说明中明确“按 Token 成本比例消耗”，但并未公开不同模型、输入/输出及缓存命中率的内部折算权重。因此，Token Lens 严格基于在线连续采样到的同周期 `Remaining Fraction` 净下降量计算 `Quota Burn Rate` 与 `Quota Depletion ETA`，并设置同周期截断（重置跳变即清空旧周期采样）与分窗口最小观测门槛（`5h` 桶至少 `≥ 10 分钟`、`weekly` 桶至少 `≥ 60 分钟` 且累计降幅 `≥ 0.2%`），严禁硬编码“1M Token = X% 额度”之类的黑盒换算公式。

## Considered Options

- **内置静态 Token→Quota 折算表猜测单轮或单会话扣减比例**：不同模型单价、思考 Token 权重、缓存读取折扣随时可能由服务端动态调整，硬编码公式会产生与真实余额严重背离的幻觉数字，违背 [ADR-0002](./0002-measured-usage-over-preflight-estimate.md) 确立的不猜测原则。
- **直接对跨重置周期或超短时间窗口内的微弱波动求导**：跨周期重置回升会算出负速率，而 10 秒内 `0.1%` 的抖动会被放大成 `36%/h` 的虚假撞墙警报。
- **同周期实测差分 + 最小观测门槛**：在采样未达门槛或处于 `100%` 满额待激活状态时明确展示“观测累计中”或“满额待激活”，达标后仅展示账号级全局实测速率（显式标注包含并发会话与子代理影响）。

## Consequences

- `Quota Burn Rate` 与 `Quota Depletion ETA` 始终严格对齐 Antigravity 真实扣费结果，不会因官方调价或缓存折扣变化而失效。
- 用户在刚开启面板或额度刚重置的最初几十秒内不会立刻看到预测斜率，需等待达到最小采样跨度与降幅门槛后才输出预警。
