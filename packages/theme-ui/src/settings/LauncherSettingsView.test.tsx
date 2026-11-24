// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
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
		const onOpenLauncher = vi.fn();
		const container = render({ onOpenLauncher });
		const button = Array.from(container.querySelectorAll("button")).find((el) => el.textContent?.includes("Try it now"));
		expect(button).toBeDefined();
		act(() => button?.click());
		expect(onOpenLauncher).toHaveBeenCalledTimes(1);
	});

	it("keeps the panel preview out of the accessibility tree and non-interactive", () => {
		const container = render();
		const preview = Array.from(container.querySelectorAll('[aria-hidden="true"]')).find((el) =>
			el.textContent?.includes("Refactor sign-in"),
		);
		expect(preview).toBeDefined();
		expect(preview?.querySelector("button")).toBeNull();
		expect(preview?.textContent).toContain("Needs you");
	});

	it("shows the user's current shortcut, not a hard-coded default", () => {
		const container = render({ shortcut: "mod+shift+k", shortcutIsDefault: false });
		const hint = Array.from(container.querySelectorAll('[role="img"]')).map((el) => el.getAttribute("aria-label"));
		expect(hint.some((label) => label?.toLowerCase().includes("k"))).toBe(true);
		expect(hint.some((label) => label?.toLowerCase().endsWith("t"))).toBe(false);
	});
});
