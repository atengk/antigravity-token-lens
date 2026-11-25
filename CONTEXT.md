# Antigravity Token Lens

Antigravity Token Lens 是挂载于 Antigravity 辅助面板的实时上下文水位、吞吐率、缓存诊断与账号配额观测域。本词汇表定义该上下文中的核心领域术语，统一对话、设计文档与界面表达中的语义边界。

## Language

### 上下文与吞吐 (Context & Throughput)

**Host Effective Limit（宿主有效上下文上限）**:
Antigravity 宿主运行时实际为当前会话模型分配并执行检查点与压缩截断的上下文窗口上限（以 Token 计，例如当前 Gemini 4 系列为 `512,000`）。
_Avoid_: 模型原生上限、模型理论窗口、512KB

**Native Context Window（模型原生上下文窗口）**:
模型提供商在原生 API 层公开宣称的理论最大上下文容量（例如 Gemini 4 / 3.8 Flash 原生为 `1,048,576`，Claude 5.5 原生为 `1,000,000`），与宿主运行时配额可能不同。
_Avoid_: 实际可用上限、宿主窗口

**Context Limit Override（上下文上限覆盖）**:
用户在面板设置中针对特定会话或模型家族手动指定的上下文上限，优先级高于宿主上报值与内置参考值。
_Avoid_: 默认上限、硬编码上限

**Model Alias（模型别名标识）**:
Antigravity 宿主内部在用户状态配置或轨迹元数据中使用的占位/枚举标识符（如 `MODEL_PLACEHOLDER_M525`、`MODEL_PLACEHOLDER_M532`）。
_Avoid_: 模型显示名、模型版本名

**Model Family Key（模型家族键）**:
剥离推理档位后缀（如 `High`、`Medium`、`Low`、`XHigh`）后的归一化模型家族标识（如 `gemini-4-hydrogen`、`gemini-4-neon`、`claude-sonnet-5.5`），用于跨档位复用参考上限与用户覆盖配置。
_Avoid_: 完整模型 ID、档位名称

**Token Unit（Token 计数单位 `K` / `M`）**:
上下文水位与吞吐统计统一使用十进制 Token 计数单位（`1K = 1,000 tokens`，`1M = 1,000,000` 或模型公布的精确 Token 数），与文件/缓存体积的字节单位（`KB` / `KiB` / `MiB`）严格区分。
_Avoid_: KB、MB、512KB

**Context Used（当前上下文占用）**:
会话在当前时刻权威采信的上下文窗口占用 Token 数；已完成轮优先采用 `Measured Prompt Input`，生成中空档期回退到 `Host Pre-flight Estimate`。
_Avoid_: 累计消耗（Total Tokens）、预估占用

**Measured Prompt Input（服务端实测输入）**:
单次模型请求完成后，由模型提供商账单返回的实际送入上下文窗口的提示词输入 Token 总量（非缓存输入、缓存读取与缓存写入之和，不含当轮模型输出）。
_Avoid_: 总消耗、含输出占用

**Host Pre-flight Estimate（宿主发包前预估）**:
Antigravity 宿主在向模型发起请求前，通过本地分词/启发式估算得出的上下文近似值及其构成明细总计，存在数千 Token 的自然误差。
_Avoid_: 实测占用、真实上下文

**Estimation Delta（预估偏差 `Δ`）**:
`Measured Prompt Input` 与 `Host Pre-flight Estimate` 之间的差值，用于向用户透明解释结构拆解明细总和与实测主水位之间的天然差异。
_Avoid_: 误差补正、缩放差额

**Customization Base（定制底座）**:
除基础系统提示与内置工具外，由 `Rules`、`Skills`、`Subagents`、`Plugins` 与 `MCP Tools` 共同构成的常驻上下文固定开销。
_Avoid_: 其他上下文、系统杂项

### 账户配额与速率限制 (Account Quota & Limits)

**Quota Group（配额组）**:
共享同一套用量限额池的模型集合（例如 `Gemini Models` 或 `Claude and GPT models`），组内任意模型的调用均扣减该组共用的配额桶。
_Avoid_: 模型分类、单模型限额

**Quota Bucket（配额桶）**:
配额组下按固定周期窗口统计剩余额度与重置时刻的独立计数单元（如 `5h` 短期平滑窗口与 `weekly` 周度个人配额窗口）。
_Avoid_: 额度进度条、用量卡片

**Remaining Fraction（剩余配额比例）**:
配额桶当前剩余可用额度占该周期总限额的小数比例（范围 `0` 至 `1`），用于高精度微消耗观测与速率推算。
_Avoid_: 剩余整数百分比、已用比例

**Reset Time（配额重置时刻）**:
当前配额桶周期结束并恢复满额的绝对 UTC 时间点，用于计算重置倒计时及判定周期内是否会提前耗尽。
_Avoid_: 冷却时间、剩余时长

**Quota Burn Rate（配额消耗速率）**:
单位时间内配额桶 `Remaining Fraction` 的净下降速度，基于连续在线采样窗口测算，用于评估账户级配额续航。
_Avoid_: 生成速率、tok/s

**Quota Depletion ETA（预计耗尽时刻）**:
按当前 `Quota Burn Rate` 推算配额桶归零的时间点；当其早于 `Reset Time` 时触发周期内撞墙预警。
_Avoid_: 预计剩余轮数

**Plan Credits（套餐积分）**:
用户订阅等级下按账户维度统计的可用 Prompt 与 Flow 积分余额，独立于模型组的周期性配额桶。
_Avoid_: 配额桶、Token 余额

### 全量周期统计 (Historical Usage Ledger)

**Usage Ledger（全量用量账本）**:
基于全部本地主会话与派生子代理轨迹逐轮归档并按本地自然日分摊的周期性（日 / 周 / 月 / 年）Token 消耗统计账本。
_Avoid_: 单会话累计消耗、配额桶

**Time-Bucketed Usage（周期分桶用量）**:
按本机时区自然日、自然周（ISO Week）、自然月或自然年汇总的模型级 `Uncached Input`、`Cache Read` 与 `Output` 消耗统计。
_Avoid_: 滑窗配额、5h 限额

### 可用性巡检与告警 (Availability Watchdog & Alerting)

**Availability Watchdog（可用性巡检）**:
Sidecar 后台持续观测本机 Language Server 全局会话状态与账户配额的独立巡检机制，仅在发生需人工介入的阻塞故障时触发外发消息，与面板内常规上下文水位提醒严格隔离。
_Avoid_: 面板预警、系统通知

**Alert Channel（告警通知通道）**:
接收 `Availability Watchdog` 所发出阻塞告警的外部消息投递目标（如飞书、钉钉、企业微信或通用自定义 Webhook）。
_Avoid_: 桌面弹窗、推送方式

**Watchdog Incident（可用性事件）**:
由 `Availability Watchdog` 识别的需人工介入阻塞状态（涵盖终态失败、持续重试卡死、上游静默挂起、配额耗尽及 Language Server 失联），按故障指纹去重冷却并跟踪恢复闭环。
_Avoid_: 告警日志、错误提示
