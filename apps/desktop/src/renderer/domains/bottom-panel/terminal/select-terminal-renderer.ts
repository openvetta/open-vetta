/**
 * 终端渲染器选择。
 *
 * WebGL 最快，但浏览器同时能持有的 WebGL 上下文只有十几个，多开几个终端就会互相踢掉
 * （被踢的那个直接黑屏）。所以只有**当前活动格**用 WebGL，其它格退到 xterm 自带的 DOM
 * 渲染器。关掉硬件加速、拿不到 webgl2、或丢过一次上下文时也一律 DOM。
 *
 * 不走 canvas addon：仓库钉的是 `@xterm/xterm@6`，而 `@xterm/addon-canvas@0.7`
 * 只兼容 xterm 5。它在 dispose 时会按 xterm 5 的 `linkifier2` 去重建默认渲染器，
 * 读到 undefined 的 `onShowLinkUnderline`，把整页打进路由错误页。
 */
export type TerminalRendererKind = "webgl" | "dom";

export interface SelectTerminalRendererInput {
	readonly hasWebgl2: boolean;
	readonly hardwareAccelerated: boolean;
	readonly isActiveLeaf: boolean;
	/** WebGL 上下文丢失过一次就不再重试：多半是驱动问题，重试只会再黑一次。 */
	readonly contextLost?: boolean;
}

export function selectTerminalRenderer(input: SelectTerminalRendererInput): TerminalRendererKind {
	if (input.contextLost) return "dom";
	if (!input.hasWebgl2 || !input.hardwareAccelerated) return "dom";
	return input.isActiveLeaf ? "webgl" : "dom";
}

export function detectWebgl2Support(create: () => HTMLCanvasElement = () => document.createElement("canvas")): boolean {
	try {
		return create().getContext("webgl2") !== null;
	} catch {
		return false;
	}
}
