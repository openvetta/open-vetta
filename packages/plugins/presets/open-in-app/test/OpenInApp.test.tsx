// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const conversation = { cwd: "/Users/me/project" as string | null };
vi.mock("@vetta-org/plugin-sdk", () => ({
	useActiveConversation: () => conversation,
	useTranslation: () => ({ t: (key: string) => key }),
}));

import type { PluginHeaderActionState } from "@vetta-org/plugin-sdk";
import { releaseHostApis, setHostApis, useOpenInAppAction } from "../src/OpenInApp";

function createCommand(installed: string[]) {
	return {
		run: vi.fn(async (_file: string, args: string[] = []) => {
			// open -Ra <App>：装了返回 0，没装返回 1。
			if (args[0] === "-Ra") return { exitCode: installed.includes(args[1] ?? "") ? 0 : 1, stdout: "", stderr: "" };
			return { exitCode: 0, stdout: "", stderr: "" };
		}),
	};
}

/** 像宿主探针那样调用声明 hook，返回最近一次的声明。 */
async function declare(): Promise<{ current: PluginHeaderActionState | null }> {
	const latest: { current: PluginHeaderActionState | null } = { current: null };
	function Probe(): null {
		latest.current = useOpenInAppAction();
		return null;
	}
	const app = document.createElement("div");
	document.body.append(app);
	await act(async () => {
		createRoot(app).render(<Probe />);
	});
	// 让探测的 Promise 落地。
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
	return latest;
}

beforeEach(() => {
	conversation.cwd = "/Users/me/project";
	Object.defineProperty(navigator, "platform", { value: "MacIntel", configurable: true });
});

afterEach(() => {
	document.body.replaceChildren();
	setHostApis(undefined, undefined);
});

describe("useOpenInAppAction", () => {
	it("declares a menu action listing only the installed apps", async () => {
		const command = createCommand(["Zed"]);
		setHostApis(command as never, vi.fn());
		const state = (await declare()).current;
		expect(state?.title).toBe("action.title");
		expect(state?.onClick).toBeUndefined();
		const ids = (state?.menuItems ?? []).map((item) => item.id);
		// Finder / 终端免探测；没装的 VS Code 等不出现。
		expect(ids).toContain("finder");
		expect(ids).toContain("zed");
		expect(ids).not.toContain("vscode");
		const probed = command.run.mock.calls.filter(([, args]) => args?.[0] === "-Ra").map(([, args]) => args?.[1]);
		expect(probed).toContain("Zed");
	});

	it("opens the chosen app on the project directory", async () => {
		const command = createCommand(["Zed"]);
		setHostApis(command as never, vi.fn());
		const state = (await declare()).current;
		state?.menuItems?.find((item) => item.id === "zed")?.onSelect();
		await act(async () => {});
		expect(command.run).toHaveBeenCalledWith("open", ["-a", "Zed", "/Users/me/project"], expect.anything());
	});

	it("declares null for an SSH remote project so the host collapses the slot", async () => {
		conversation.cwd = "ssh://host/home/me/project";
		setHostApis(createCommand([]) as never, vi.fn());
		expect((await declare()).current).toBeNull();
	});

	it("declares null off macOS", async () => {
		Object.defineProperty(navigator, "platform", { value: "Win32", configurable: true });
		setHostApis(createCommand([]) as never, vi.fn());
		expect((await declare()).current).toBeNull();
	});

	it("declares null when there is no active directory", async () => {
		conversation.cwd = null;
		setHostApis(createCommand([]) as never, vi.fn());
		expect((await declare()).current).toBeNull();
	});
});

describe("releaseHostApis", () => {
	it("does not wipe the apis of a newer activation", async () => {
		const older = createCommand([]);
		const newer = createCommand(["Zed"]);
		setHostApis(older as never, vi.fn());
		setHostApis(newer as never, vi.fn());
		releaseHostApis(older as never);
		expect((await declare()).current).not.toBeNull();
	});
});
