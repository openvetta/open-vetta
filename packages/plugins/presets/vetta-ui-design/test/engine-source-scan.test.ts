/**
 * 引擎样式表把整个设计目录当 Tailwind `@source` 扫描，而 @tailwindcss/vite 对「被扫描、
 * 但不是 JS/CSS 模块」的文件一变就整页 full-reload。画布每次缩放、平移、移动 frame
 * 都会回写 design.json——它留在扫描范围里，每次手势结束约 1 秒后所有活体 frame 都会
 * 重载一遍，选中的那一帧闪白。
 *
 * 真正的接缝是跑起来的 vite 引擎（这里装不了它的依赖），所以只锁住模板里的排除声明。
 */
import { expect, it } from "vitest";
import { ENGINE_FILES } from "../src/engine/engine-files";
import { MANIFEST_FILE } from "../src/vetd/manifest-types";

it("Tailwind 扫描设计目录时排除画布清单，回写视口不再整页重载 frame", () => {
	const config = ENGINE_FILES["vite.config.mjs"];
	expect(config).toContain('@source "${designRootPosix}";');
	expect(config).toContain(`@source not "\${designRootPosix}/${MANIFEST_FILE}";`);
});
