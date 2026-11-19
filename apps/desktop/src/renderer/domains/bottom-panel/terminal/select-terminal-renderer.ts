/**
 * 终端渲染器选择。
 *
 * WebGL 最快，但浏览器同时能持有的 WebGL 上下文只有十几个，多开几个终端就会互相踢掉
 * （被踢的那个直接黑屏）。所以只有**当前活动格**用 WebGL，其它格用 xterm 内置的 DOM 渲染器；
 * 关掉硬件加速或拿不到 webgl2 时全部走 DOM。
 *
 * 不挂 @xterm/addon-canvas：它只支持 xterm 5，销毁时会拿已经释放的 core 重建渲染器并抛错。
 */
export type TerminalRendererKind = "webgl" | "dom";

export interface SelectTerminalRendererInput {
	readonly hasWebgl2: boolean;
	readonly hardwareAccelerated: boolean;
	readonly isActiveLeaf: boolean;
}

export function selectTerminalRenderer(input: SelectTerminalRendererInput): TerminalRendererKind {
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
