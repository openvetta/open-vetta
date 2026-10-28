import type { PluginFsApi } from "@vetta-org/plugin-sdk";
import { designPackageJson, PACKAGE_FILE } from "./design-package";
import { emptyManifest, type FrameSize, manifestPathOf, type VetdManifest } from "./manifest-types";
import type { StatusBarSetting } from "./status-bar";

// 注意：这段是写进用户项目里的产物文件，不是插件 UI 文案，所以不走 locales；
// 但也不能是中文——英文宿主的用户同样会拿到这个文件。
/**
 * 脚手架主题是中性灰的占位，不是一套能直接用的配色：旧版写的是 indigo / slate / amber，
 * 正是一眼能认出的 AI 默认配色，模型没换就照着开画。占位带一个标记，check-sources 见到
 * 标记还在而已有画框，就报 `theme-placeholder`，直到方向表的 theme.css 把它整个换掉。
 */
export const PLACEHOLDER_THEME_MARK = "vetd:placeholder-theme";

export const DEFAULT_THEME_CSS = `/* ${PLACEHOLDER_THEME_MARK} — a neutral placeholder, not a palette.
 * Replace this whole file with your direction's theme.css (Tailwind v4 @theme
 * tokens, used by every frame as bg-primary, text-surface-foreground, …)
 * before the first frame. */
@theme {
	--color-primary: #3d3d3d;
	--color-primary-foreground: #ffffff;
	--color-surface: #f5f5f5;
	--color-surface-foreground: #171717;
	--color-panel: #ebebeb;
	--color-muted: #616161;
	--color-danger: #b42318;
}
`;

export interface ScaffoldResult {
	/** The `x.vetd/` bundle directory. */
	vetdPath: string;
	/** Same directory; kept as a separate field because callers read sources from it. */
	dirPath: string;
}

/**
 * Create a design bundle skeleton (`x.vetd/` + design.json). The plugin —
 * not the agent — always writes this scaffold (single-writer rule); the agent
 * goes through the vetd_create tool which lands here.
 *
 * 刻意不铺任何示例 frame：产物可能是界面、幻灯片、海报，预置一个手机画框等于
 * 替用户押了尺寸和品类。零 frame 的画布自己会给出引导（DesignCanvas 空态）。
 *
 * `defaultFrameSize` 是品类本身，和示例 frame 不是一回事：它不往画布上放任何东西，
 * 只在某个画框漏声明尺寸时兜底（frame-size.ts）。画布上手动新建设计时问不到品类，
 * 传 null 即可。
 */
export async function scaffoldDesign(
	fs: PluginFsApi,
	cwd: string,
	rawName: string,
	defaultFrameSize?: FrameSize | null,
	statusBar?: StatusBarSetting | null,
): Promise<ScaffoldResult> {
	const name = sanitizeDesignName(rawName);
	let vetdPath = `${cwd}/${name}.vetd`;
	let suffix = 1;
	while ((await fs.stat(vetdPath)) !== null) {
		vetdPath = `${cwd}/${name}-${suffix}.vetd`;
		suffix += 1;
	}
	await fs.createDirectory(`${vetdPath}/frames`);
	await fs.createDirectory(`${vetdPath}/components`);
	await fs.createDirectory(`${vetdPath}/assets`);
	await fs.writeFile(`${vetdPath}/theme.css`, DEFAULT_THEME_CSS);
	await fs.writeFile(`${vetdPath}/${PACKAGE_FILE}`, designPackageJson(name));
	const manifest: VetdManifest = {
		...emptyManifest(),
		...(defaultFrameSize ? { defaultFrameSize } : {}),
		...(statusBar ? { statusBar } : {}),
	};
	await fs.writeFile(manifestPathOf(vetdPath), `${JSON.stringify(manifest, null, "\t")}\n`);
	return { vetdPath, dirPath: vetdPath };
}

export function sanitizeDesignName(raw: string): string {
	const cleaned = raw
		.trim()
		.replace(/\.vetd$/i, "")
		.replace(/[\\/:*?"<>|\s]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	return cleaned || "design";
}

/** Frame source template used by the canvas "Frame" tool (drag-to-create). */
export function blankFrameSource(title: string, width: number, height: number): string {
	return `export const frame = { width: ${width}, height: ${height}, title: "${title}" };

export default function Frame() {
	return <div className="h-full bg-surface" />;
}
`;
}
