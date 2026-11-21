# Antigravity Token Lens

Antigravity Token Lens 是挂载于 Antigravity 辅助面板的实时上下文水位、吞吐率与缓存诊断域。本词汇表定义该上下文中的核心领域术语，统一对话、设计文档与界面表达中的语义边界。

## Language

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
