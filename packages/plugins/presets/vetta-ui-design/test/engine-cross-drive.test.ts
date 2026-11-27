/**
 * Windows 上引擎在 C:（用户目录下的插件数据区），设计文件可以在 D:。vite 的
 * `import.meta.glob` 会把命中的文件改写成「相对 importer」的 POSIX 路径，跨盘符时
 * 拼出 `../../../D:/…/frames/x.tsx`，入口 main.tsx 直接 500，画布整片空白。
 *
 * frame 表因此改由引擎自己的 `virtual:vetd-frames` 生成，每个 frame 都走 `@design`
 * 别名导入（解析成绝对路径，开发态服务为 `/@fs/D:/…`）。这里锁住两头：入口不再
 * 对设计目录做 glob，虚拟模块的导入经由别名而不是相对路径。真正的接缝是跑起来的
 * vite 引擎，本包装不了它的依赖。
 */
import { expect, it } from "vitest";
import { ENGINE_FILES } from "../src/engine/engine-files";

it("入口不对设计目录做 import.meta.glob，frame 表来自虚拟模块", () => {
	const main = ENGINE_FILES["src/main.tsx"];
	expect(main).not.toMatch(/import\.meta\.glob[^(]*\(\s*["'`]@design/);
	expect(main).toContain('from "virtual:vetd-frames"');
});

it("虚拟模块经 @design 别名导入每个 frame，不计算跨目录的相对路径", () => {
	const config = ENGINE_FILES["vite.config.mjs"];
	expect(config).toContain("vetdFrames(),");
	expect(config).toContain("JSON.stringify(`@design/frames/${name}`)");
	// 新增/删除 frame 时失效的是虚拟模块本身，否则新 frame 一直 "Frame not found"。
	expect(config).toContain("getModuleById(RESOLVED_FRAMES_MODULE_ID)");
});
