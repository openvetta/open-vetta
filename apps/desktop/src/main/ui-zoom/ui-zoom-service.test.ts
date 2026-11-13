import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
const setWindowButtonPosition = vi.fn();
const winHandlers = new Map<string, () => void>();
const fakeWindow = {
	isDestroyed: () => false,
	setWindowButtonPosition,
	on: (event: string, handler: () => void) => winHandlers.set(event, handler),
};
const updateDesktopConfig = vi.fn(async (update: (c: Record<string, unknown>) => Record<string, unknown>) =>
	update({}),
);
const readConfigSync = vi.fn(() => ({ uiZoomFactor: undefined as number | undefined }));

vi.mock("electron", () => ({
	BrowserWindow: {
		getAllWindows: () => [{ isDestroyed: () => false, webContents: { send } }],
		fromWebContents: () => fakeWindow,
	},
}));
vi.mock("../config/desktop-config-store.js", () => ({ readConfigSync, updateDesktopConfig }));

function fakeContents(initial = 1) {
	let zoom = initial;
	const handlers = new Map<string, () => void>();
	return {
		isDestroyed: () => false,
		getZoomFactor: () => zoom,
		setZoomFactor: vi.fn((v: number) => {
			zoom = v;
		}),
		on: (event: string, handler: () => void) => handlers.set(event, handler),
		fire: (event: string) => handlers.get(event)?.(),
	};
}

async function load() {
	vi.resetModules();
	return import("./ui-zoom-service.js");
}

beforeEach(() => {
	send.mockClear();
	setWindowButtonPosition.mockClear();
	winHandlers.clear();
	vi.stubGlobal("process", { ...process, platform: "darwin" });
	updateDesktopConfig.mockClear();
	readConfigSync.mockReturnValue({ uiZoomFactor: undefined });
});

describe("ui zoom service", () => {
	it("缩放变化时红绿灯跟着挪，全屏退出后再套一次", async () => {
		const { attachUiZoom, setUiZoomFactor } = await load();
		attachUiZoom(fakeContents() as never);
		expect(setWindowButtonPosition).toHaveBeenLastCalledWith({ x: 16, y: 24 });

		await setUiZoomFactor(1.25);
		expect(setWindowButtonPosition).toHaveBeenLastCalledWith({ x: 16, y: 31 });

		setWindowButtonPosition.mockClear();
		winHandlers.get("leave-full-screen")?.();
		expect(setWindowButtonPosition).toHaveBeenCalledWith({ x: 16, y: 31 });
	});

	it("渲染进程上报实测中线后红绿灯立即对齐，非法值被丢弃", async () => {
		const { attachUiZoom, setTitlebarCenter, setUiZoomFactor } = await load();
		attachUiZoom(fakeContents() as never);

		setTitlebarCenter(30);
		expect(setWindowButtonPosition).toHaveBeenLastCalledWith({ x: 16, y: 26 });

		setWindowButtonPosition.mockClear();
		setTitlebarCenter("bad");
		setTitlebarCenter(Number.NaN);
		expect(setWindowButtonPosition).not.toHaveBeenCalled();

		await setUiZoomFactor(1.5); // 缩放后仍沿用最近一次实测中线
		expect(setWindowButtonPosition).toHaveBeenLastCalledWith({ x: 16, y: 41 });
	});

	it("启动时按配置里的比例套到主窗口，页面重新加载后再套一次", async () => {
		readConfigSync.mockReturnValue({ uiZoomFactor: 1.25 });
		const { attachUiZoom } = await load();
		const contents = fakeContents(1);

		attachUiZoom(contents as never);
		expect(contents.setZoomFactor).toHaveBeenCalledWith(1.25);

		contents.setZoomFactor(1); // 模拟 Chromium 在导航后回到自己记的值
		contents.fire("did-finish-load");
		expect(contents.setZoomFactor).toHaveBeenLastCalledWith(1.25);
	});

	it("设置比例：夹取后立即生效、广播并落盘", async () => {
		const { attachUiZoom, setUiZoomFactor } = await load();
		const contents = fakeContents();
		attachUiZoom(contents as never);

		await expect(setUiZoomFactor(9)).resolves.toBe(1.5);

		expect(contents.setZoomFactor).toHaveBeenCalledWith(1.5);
		expect(send).toHaveBeenCalledWith("vetta:ui-zoom:changed", 1.5);
		expect(updateDesktopConfig).toHaveBeenCalledTimes(1);
	});

	it("比例没变时不重复写盘和广播", async () => {
		const { setUiZoomFactor } = await load();

		await setUiZoomFactor(1);

		expect(updateDesktopConfig).not.toHaveBeenCalled();
		expect(send).not.toHaveBeenCalled();
	});

	it("快捷键步进与恢复默认走同一入口", async () => {
		const { resetUiZoom, stepUiZoom } = await load();

		await expect(stepUiZoom(1)).resolves.toBe(1.1);
		await expect(stepUiZoom(-1)).resolves.toBe(1);
		await stepUiZoom(1);
		await expect(resetUiZoom()).resolves.toBe(1);
	});
});
