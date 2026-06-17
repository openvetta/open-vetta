import { definePlugin } from "@vetta/plugin-sdk";

// 纯引导词插件：不注册任何 UI 或工具，仅通过 plugin.json 的 guidingWords
// 在新会话欢迎页贡献一组常用引导词。activate 留空即可。
export default definePlugin({
	activate() {},
});
