/**
 * 引擎首屏的 frame 与外壳都是懒加载的。只靠 React.lazy 时首次渲染必然挂起，React 19
 * 在 fallback 露面后至少再压 300ms 才换上真实内容——模块早就到了，画面却干等。
 * 这里锁住 preloadable 的契约：预载过的首次渲染不挂起；没预载、预载失败时仍走 lazy。
 */
import { act, Component, type ReactNode, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { preloadable } from "../engine/src/preloadable";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
});

afterEach(() => {
	act(() => root.unmount());
	host.remove();
});

function FrameContent() {
	return <p>frame content</p>;
}

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
	state = { failed: false };
	static getDerivedStateFromError(): { failed: boolean } {
		return { failed: true };
	}
	render(): ReactNode {
		return this.state.failed ? <p>build failed</p> : this.props.children;
	}
}

/** 首次提交时看到的内容：挂起的话这里是 fallback。 */
function renderOnce(Frame: () => ReactNode): string {
	act(() => {
		root.render(
			<Boundary>
				<Suspense fallback={<p>fallback</p>}>
					<Frame />
				</Suspense>
			</Boundary>,
		);
	});
	return host.textContent ?? "";
}

it("预载过的组件首次渲染就是内容，不经过 fallback（也就没有 300ms 节流）", async () => {
	const frame = preloadable(() => Promise.resolve({ default: FrameContent }));
	await frame.preload();
	expect(renderOnce(frame.Component)).toBe("frame content");
});

it("没预载时照旧挂起：先 fallback，模块到了再换内容", async () => {
	let resolve!: (mod: { default: typeof FrameContent }) => void;
	const frame = preloadable(() => new Promise((r) => (resolve = r)));
	expect(renderOnce(frame.Component)).toBe("fallback");
	await act(async () => resolve({ default: FrameContent }));
	expect(host.textContent).toBe("frame content");
});

it("预载失败不抛，渲染时错误照常落到错误边界", async () => {
	const frame = preloadable(() => Promise.reject(new Error("syntax error in frame")));
	await expect(frame.preload()).resolves.toBeUndefined();
	const original = console.error;
	console.error = () => {};
	try {
		renderOnce(frame.Component);
		await act(async () => {});
	} finally {
		console.error = original;
	}
	expect(host.textContent).toBe("build failed");
});
