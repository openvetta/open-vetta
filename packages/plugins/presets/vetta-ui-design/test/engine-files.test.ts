/**
 * 引擎模板靠 ENGINE_FILES 这张手写清单物化到用户机器上。engine/src 下新加一个文件
 * 而忘了登记，本仓库里一切正常（vite 直接读源码），到用户那边引擎入口就 import 失败，
 * 画布上所有 frame 一起白屏。
 */
import { expect, it } from "vitest";
import { ENGINE_FILES } from "../src/engine/engine-files";

it("引擎源码里的每个相对 import 都在物化清单里", () => {
	const missing: string[] = [];
	for (const [rel, content] of Object.entries(ENGINE_FILES)) {
		if (!/^src\/.*\.tsx?$/.test(rel)) continue;
		for (const match of content.matchAll(/from\s+"\.\/([^"]+)"/g)) {
			const spec = match[1];
			if (spec.endsWith(".css")) {
				if (!(`src/${spec}` in ENGINE_FILES)) missing.push(`${rel} → ${spec}`);
				continue;
			}
			const found = [`src/${spec}.ts`, `src/${spec}.tsx`, `src/${spec}`].some((candidate) => candidate in ENGINE_FILES);
			if (!found) missing.push(`${rel} → ${spec}`);
		}
	}
	expect(missing).toEqual([]);
	expect(ENGINE_FILES["src/main.tsx"]).toContain('from "./preloadable"');
});
