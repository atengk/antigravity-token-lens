---
name: token-lens
description: 打开 Token Lens 实时看板，查看当前会话及子代理的上下文水位、Token 构成拆解、输出速率（tok/s）、TTFT 与缓存命中率。在用户输入 /token-lens 或询问上下文占比、Token 消耗、缓存命中及速率时激活。
---

# Token Lens 面板唤起指南

当用户调用 `/token-lens` 或希望在界面中直观查看当前会话的 Token 消耗、上下文占用比例、缓存命中率或生成速率时，直接输出下方的 `sidecar://` 面板胶囊链接，引导用户在右侧辅助面板（Aux Pane）打开实时看板：

```markdown
[打开 Token Lens 实时面板](sidecar://token-lens/panel/)
```

如果用户同时要求简要文字分析（例如直接问“现在上下文用了多少”），再简明结合结论补充说明；若仅要求打开面板，直接给出链接即可，避免刷屏。
