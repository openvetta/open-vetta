import { afterEach, describe, expect, it, vi } from "vitest";
import { canvasActionState, designName, openCanvasFor } from "../src/header/canvas-header-action";
import { cachedDesignPaths, resetDesignPaths, setDesignPaths } from "../src/vetd/design-presence";

/** 宿主与画布收到的请求按发生顺序记下来：断言看的是最终发生了什么、先后如何。 */
const mocks = vi.hoisted(() => {
	const log: unknown[][] = [];
	return {
		log,
		ui: {
			setActivityTabVisible: (...args: unknown[]) => log.push(["visible", ...args]),
			openActivityTab: (...args: unknown[]) => log.push(["open", ...args]),
			setActivityPanelWidth: (...args: unknown[]) => log.push(["width", ...args]),
		},
		pending: (...args: unknown[]) => log.push(["pending", ...args]),
	};
});

vi.mock("../src/plugin-context", () => ({
	getPluginCtx: () => ({ ui: mocks.ui }),
}));

vi.mock("../src/canvas/design-runtime", () => ({
	setPendingDesignPath: mocks.pending,
}));

const t = (key: string) => key;

afterEach(() => {
	resetDesignPaths();
	mocks.log.length = 0;
});

describe("designName", () => {
	it("strips the .vetd suffix and any directory", () => {
		expect(designName("/repo/landing.vetd")).toBe("landing");
		expect(designName("C:\\repo\\shop.vetd")).toBe("shop");
	});
});

describe("canvasActionState", () => {
	it("takes no slot when the workspace holds no design", () => {
		expect(canvasActionState({ designs: [], open: () => {}, t })).toBeNull();
	});

	it("opens the only design straight away", () => {
		const opened: string[] = [];
		const state = canvasActionState({ designs: ["/repo/landing.vetd"], open: (path) => opened.push(path), t });
		expect(state?.label).toBe("header.openCanvas");
		expect(state?.menuItems).toBeUndefined();
		(state?.onClick as () => void)();
		expect(opened).toEqual(["/repo/landing.vetd"]);
	});

	it("lists every design when there is more than one, so the user picks", () => {
		const opened: string[] = [];
		const state = canvasActionState({
			designs: ["/repo/a.vetd", "/repo/b.vetd"],
			open: (path) => opened.push(path),
			t,
		});
		expect(state?.onClick).toBeUndefined();
		expect(state?.menuItems?.map((item) => item.label)).toEqual(["a", "b"]);
		state?.menuItems?.[1]?.onSelect();
		expect(opened).toEqual(["/repo/b.vetd"]);
	});
});

describe("openCanvasFor", () => {
	it("hands the design to the canvas before revealing the tab", () => {
		openCanvasFor("/repo", "/repo/landing.vetd");
		expect(mocks.log).toEqual([
			["pending", "/repo/landing.vetd", "/repo"],
			["visible", "canvas", true, { cwd: "/repo" }],
			["width", "max"],
			["open", "canvas", { width: "max", cwd: "/repo" }],
		]);
	});

	it("opens whatever the canvas last had selected when no design is named", () => {
		openCanvasFor("/repo");
		expect(mocks.log).toEqual([
			["visible", "canvas", true, { cwd: "/repo" }],
			["width", "max"],
			["open", "canvas", { width: "max", cwd: "/repo" }],
		]);
	});
});

describe("design list cache", () => {
	it("sorts what a conversation switch discovered", () => {
		setDesignPaths("/repo", ["/repo/b.vetd", "/repo/a.vetd"]);
		expect(cachedDesignPaths("/repo")).toEqual(["/repo/a.vetd", "/repo/b.vetd"]);
	});

	it("keeps 'scanned, nothing found' apart from 'never scanned'", () => {
		setDesignPaths("/empty", []);
		expect(cachedDesignPaths("/empty")).toEqual([]);
		expect(cachedDesignPaths("/never")).toBeUndefined();
	});
});
