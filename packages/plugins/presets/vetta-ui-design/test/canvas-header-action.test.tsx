import { afterEach, describe, expect, it, vi } from "vitest";
import { canvasActionState, designName, openCanvasFor } from "../src/header/canvas-header-action";
import { cachedDesignPaths, resetDesignPaths, setDesignPaths } from "../src/vetd/design-presence";

const mocks = vi.hoisted(() => ({
	ui: { setActivityTabVisible: vi.fn(), openActivityTab: vi.fn() },
	pending: vi.fn(),
}));

vi.mock("../src/plugin-context", () => ({
	getPluginCtx: () => ({ ui: mocks.ui }),
}));

vi.mock("../src/canvas/design-runtime", () => ({
	setPendingDesignPath: mocks.pending,
}));

const t = (key: string) => key;

afterEach(() => {
	resetDesignPaths();
	vi.clearAllMocks();
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
		const open = vi.fn();
		const state = canvasActionState({ designs: ["/repo/landing.vetd"], open, t });
		expect(state?.label).toBe("header.openCanvas");
		expect(state?.menuItems).toBeUndefined();
		(state?.onClick as () => void)();
		expect(open).toHaveBeenCalledWith("/repo/landing.vetd");
	});

	it("lists every design when there is more than one, so the user picks", () => {
		const open = vi.fn();
		const state = canvasActionState({ designs: ["/repo/a.vetd", "/repo/b.vetd"], open, t });
		expect(state?.onClick).toBeUndefined();
		expect(state?.menuItems?.map((item) => item.label)).toEqual(["a", "b"]);
		state?.menuItems?.[1]?.onSelect();
		expect(open).toHaveBeenCalledWith("/repo/b.vetd");
	});
});

describe("openCanvasFor", () => {
	it("hands the design to the canvas before revealing the tab", () => {
		openCanvasFor("/repo", "/repo/landing.vetd");
		expect(mocks.pending).toHaveBeenCalledWith("/repo/landing.vetd", "/repo");
		expect(mocks.ui.setActivityTabVisible).toHaveBeenCalledWith("canvas", true, { cwd: "/repo" });
		expect(mocks.ui.openActivityTab).toHaveBeenCalledWith("canvas", { width: "max", cwd: "/repo" });
	});

	it("opens whatever the canvas last had selected when no design is named", () => {
		openCanvasFor("/repo");
		expect(mocks.pending).not.toHaveBeenCalled();
		expect(mocks.ui.openActivityTab).toHaveBeenCalled();
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
