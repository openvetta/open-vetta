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

import { OpenInApp, setHostApis } from "../src/OpenInApp";

function createCommand(installed: string[]) {
	return {
		run: vi.fn(async (_file: string, args: string[] = []) => {
			// open -Ra <App>：装了返回 0，没装返回 1。
			if (args[0] === "-Ra") return { exitCode: installed.includes(args[1] ?? "") ? 0 : 1, stdout: "", stderr: "" };
			return { exitCode: 0, stdout: "", stderr: "" };
		}),
	};
}

async function mount(): Promise<HTMLElement> {
	const app = document.createElement("div");
	document.body.append(app);
	await act(async () => {
		createRoot(app).render(<OpenInApp />);
	});
	// 让探测的 Promise 落地。
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
	return app;
}

beforeEach(() => {
	conversation.cwd = "/Users/me/project";
	Object.defineProperty(navigator, "platform", { value: "MacIntel", configurable: true });
});

afterEach(() => {
	document.body.replaceChildren();
	setHostApis(undefined, undefined);
});

describe("OpenInApp", () => {
	it("shows a single header button on a local macOS project", async () => {
		const command = createCommand(["Zed"]);
		setHostApis(command as never, vi.fn());
		const app = await mount();
		expect(app.querySelector("[data-slot=button-group] button[aria-haspopup=menu]")).not.toBeNull();
		// Finder 免探测；其余每个应用探测一次。
		const probed = command.run.mock.calls.filter(([, args]) => args?.[0] === "-Ra").map(([, args]) => args?.[1]);
		expect(probed).toContain("Zed");
		expect(probed).not.toContain("");
	});

	it("renders nothing for an SSH remote project so the host can collapse the slot", async () => {
		conversation.cwd = "ssh://host/home/me/project";
		setHostApis(createCommand([]) as never, vi.fn());
		const app = await mount();
		expect(app.innerHTML).toBe("");
	});

	it("renders nothing off macOS", async () => {
		Object.defineProperty(navigator, "platform", { value: "Win32", configurable: true });
		setHostApis(createCommand([]) as never, vi.fn());
		const app = await mount();
		expect(app.innerHTML).toBe("");
	});

	it("renders nothing when there is no active directory", async () => {
		conversation.cwd = null;
		setHostApis(createCommand([]) as never, vi.fn());
		const app = await mount();
		expect(app.innerHTML).toBe("");
	});
});
