import { type ComponentType, lazy } from "react";

export interface Preloadable {
	/** 渲染用的组件：已经预载好就直接渲染，否则退回 React.lazy（照常挂起）。 */
	Component: ComponentType;
	/** 提前把模块拉下来。失败不抛：错误留给 lazy 那条路在渲染期抛给错误边界。 */
	preload(): Promise<void>;
}

/**
 * 可以在首次渲染前预载的懒组件。
 *
 * 只用 React.lazy 的话，首次渲染时模块必然还没到，Suspense 先提交 fallback；
 * React 19 规定 fallback 露过面之后，真实内容至少再等 FALLBACK_THROTTLE_MS（300ms）
 * 才换上来。frame 的模块早就下载完了，画面却要干等这一段——实测单帧从加载到画完
 * 约 370ms，其中约 240ms 是这段空等。首屏要用的那几个模块在 render 之前预载好，
 * 首次渲染就不会挂起，也就没有这段节流。
 */
export function preloadable(load: () => Promise<{ default: ComponentType }>): Preloadable {
	let loaded: ComponentType | null = null;
	const Lazy = lazy(load);
	function Component() {
		const Resolved = loaded ?? Lazy;
		return <Resolved />;
	}
	return {
		Component,
		preload: () =>
			load().then(
				(mod) => {
					loaded = mod.default;
				},
				() => {},
			),
	};
}
