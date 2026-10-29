import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("交互模式隐藏状态栏的样式既认引擎自带的 StatusBar，也认设计里自己写的（按源码文件名）", () => {
	const engineStyles = readFileSync(resolve(process.cwd(), "engine/src/styles.css"), "utf8");
	expect(engineStyles).toContain("html[data-vetd-hide-status-bar] [data-vetd-status-bar]");
	expect(engineStyles).toContain('[data-vetd-source*="StatusBar" i]');
});
