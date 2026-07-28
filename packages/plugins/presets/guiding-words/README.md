# 推荐引导词（guiding-words）

系统插件（ADR-0024），随 App 发布、默认启用、用户不可删改。

本插件不注册任何 UI、工具或 Agent 能力，唯一作用是通过 `plugin.json` 的
`guidingWords` 字段向「新会话欢迎页」贡献一组常用引导词，点击即可一键开始对话。
组标题取插件 `name`（我能帮你）。

文案从用户真实意图出发（一句场景即可），不写实现细节、不堆操作步骤。
要增删引导词，修改 `plugin.json` 的 `guidingWords` 与 `locales/*.json`，并 bump `version`。
