// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { LauncherSettingsView, type LauncherSettingsViewProps } from "./LauncherSettingsView";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
	for (const { root, container } of mounted.splice(0)) {
		act(() => root.unmount());
		container.remove();
	}
});

function render(overrides: Partial<LauncherSettingsViewProps> = {}): HTMLDivElement {
	const props: LauncherSettingsViewProps = {
		labels: {
			title: "Launcher",
			subtitle: "One entry point",
			pressBefore: "Press",
			pressAfter: "to open",
			tryNow: "Try it now",
			previewPlaceholder: "Search…",
			previewNewSession: "New session",
			previewOpen: "Open",
			previewClose: "Close",
			status: { waiting: "Needs you", running: "Running", unread: "Just finished" },
			featuresTitle: "What it does",
			shortcutSectionTitle: "Shortcut",
			shortcutTitle: "Open the launcher",
			shortcutDescription: "Works anywhere",
			shortcutPlaceholder: "Press keys",
			resetLabel: "Reset",
			sidebarHint: "Sidebar search opens it too",
		},
		previewGroups: [
			{
				label: "In progress",
				rows: [{ icon: "icon-x", title: "Refactor sign-in", meta: "2 min ago", status: "waiting" }],
			},
		],
		features: [{ icon: "icon-y", title: "Search everything", description: "Find anything" }],
		featuresSection: { id: "launcher-features" },
		shortcutSection: { id: "launcher-shortcut" },
		shortcut: "mod+t",
		shortcutIsDefault: true,
		onShortcutChange: () => {},
		onShortcutReset: () => {},
		eventToShortcut: () => null,
		onOpenLauncher: () => {},
		...overrides,
	};
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	act(() => root.render(<LauncherSettingsView {...props} />));
	mounted.push({ root, container });
	return container;
}

describe("LauncherSettingsView", () => {
	it("opens the launcher from the try-it button", () => {
		let opened = 0;
		const container = render({ onOpenLauncher: () => (opened += 1) });
		const button = Array.from(container.querySelectorAll("button")).find((el) => el.textContent?.includes("Try it now"));
		expect(button).toBeDefined();
		act(() => button?.click());
		expect(opened).toBe(1);
	});

	it("renders the real panel parts but keeps them inert and hidden from assistive tech", () => {
		let opened = 0;
		const container = render({ onOpenLauncher: () => (opened += 1) });
		const preview = container.querySelector("[inert]");
		expect(preview).not.toBeNull();
		expect(preview?.getAttribute("aria-hidden")).toBe("true");
		expect(preview?.textContent).toContain("Refactor sign-in");
		expect(preview?.textContent).toContain("Needs you");
		// 预览里的输入框不能被聚焦或输入：它只是示意图。
		expect(preview?.querySelector("input")?.readOnly).toBe(true);
		// 渲染预览不会顺带触发打开启动器。
		expect(opened).toBe(0);
	});

	it("shows the user's current shortcut, not a hard-coded default", () => {
		const container = render({ shortcut: "mod+shift+k", shortcutIsDefault: false });
		const hint = Array.from(container.querySelectorAll('[role="img"]')).map((el) => el.getAttribute("aria-label"));
		expect(hint.some((label) => label?.toLowerCase().includes("k"))).toBe(true);
		expect(hint.some((label) => label?.toLowerCase().endsWith("t"))).toBe(false);
	});
});
