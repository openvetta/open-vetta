// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
	AppshotSettingsView,
	GeneralSettingsView,
	PetSettingsView,
	QuickPanelSettingsSectionView,
} from "@vetta-org/theme-ui/settings";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RemotePairingSettings } from "./RemotePairingSettings";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

afterEach(() => {
	Reflect.deleteProperty(window, "vetta");
});

describe("设置控件的可访问名称", () => {
	it("通用设置按通知和调试开关各自名称操作，状态与用途保持对应", async () => {
		function Harness(): JSX.Element {
			const [notifications, setNotifications] = useState(false);
			const [debug, setDebug] = useState(false);
			return (
				<GeneralSettingsView
					labels={{
						title: "General",
						sections: { basics: "Basics", app: "App", developer: "Developer" },
						workspaceTitle: "Workspace",
						workspaceDescription: "Workspace directory",
						sandboxTitle: "Execution mode",
						sandboxDescription: "Choose mode",
						systemNotifications: "System notifications",
						systemNotificationsDescription: "Notify when done",
						debugMode: "Debug logging",
						debugModeDescription: "Save diagnostics",
						exportDiagnostics: "Export diagnostics",
						exportDiagnosticsDescription: "Save report",
						startAppGuide: "App guide",
						startAppGuideDescription: "Tour",
						startAppGuideAction: "Start tour",
						appVersion: "Version",
						fullAccess: "Full access",
						useSandbox: "Sandbox",
						export: "Export",
						exporting: "Exporting",
						reset: "Reset",
					}}
					sections={{ basics: { id: "basics" }, app: { id: "app" }, developer: { id: "developer" } }}
					workspacePath="/tmp/workspace"
					onSelectWorkspace={() => {}}
					onResetWorkspace={() => {}}
					updatesDescription="Current"
					updatesAction={null}
					updatesDetail={null}
					executionMode="sandbox"
					onExecutionModeChange={() => {}}
					sandboxUnavailableReason={null}
					notificationsEnabled={notifications}
					onNotificationsChange={setNotifications}
					debugMode={debug}
					onDebugChange={setDebug}
					exportingDiagnostics={false}
					onExportDiagnostics={() => {}}
					onStartAppGuide={() => {}}
				/>
			);
		}
		const user = userEvent.setup();
		render(<Harness />);
		const mode = screen.getByRole("button", { name: "Execution mode" });
		expect(document.getElementById(mode.getAttribute("aria-describedby") ?? "")?.textContent).toBe("Sandbox");
		await user.click(screen.getByRole("switch", { name: "System notifications", checked: false }));
		expect(screen.getByRole("switch", { name: "System notifications", checked: true })).toBeTruthy();
		expect(screen.getByRole("switch", { name: "Debug logging", checked: false })).toBeTruthy();
		await user.click(screen.getByRole("switch", { name: "Debug logging" }));
		expect(screen.getByRole("switch", { name: "Debug logging", checked: true })).toBeTruthy();
	});

	it("桌宠关闭时相关开关禁用，开启后可按名称切换置顶和调试", async () => {
		function Harness(): JSX.Element {
			const [enabled, setEnabled] = useState(false);
			const [top, setTop] = useState(false);
			const [debug, setDebug] = useState(false);
			return (
				<PetSettingsView
					labels={{
						pageTitle: "Pet",
						materialMissing: "Missing",
						decorationAvailable: "Available",
						decorationMissing: "Missing",
						showPet: "Show pet",
						showPetDescription: "Desktop companion",
						alwaysOnTop: "Always on top",
						alwaysOnTopDescription: "Above windows",
						decorationSectionDescription: "Decorations",
						bubbleSectionDescription: "Bubbles",
						developerDescription: "Diagnostics",
						debugFrame: "Debug frame",
						debugFrameDescription: "Frame overlay",
						sections: { display: "Display", decoration: "Decoration", bubble: "Bubble", developer: "Developer" },
					}}
					sections={{
						display: { id: "display" },
						decoration: { id: "decoration" },
						bubble: { id: "bubble" },
						developer: { id: "developer" },
					}}
					enabled={enabled}
					alwaysOnTop={top}
					debugFrame={debug}
					decorations={[]}
					aiAssistSlot={null}
					bubbleGrid={null}
					onChangeEnabled={setEnabled}
					onChangeAlwaysOnTop={setTop}
					onChangeDebugFrame={setDebug}
				/>
			);
		}
		const user = userEvent.setup();
		render(<Harness />);
		expect(screen.getByRole("switch", { name: "Always on top" }).hasAttribute("disabled")).toBe(true);
		await user.click(screen.getByRole("switch", { name: "Show pet" }));
		await user.click(screen.getByRole("switch", { name: "Always on top" }));
		await user.click(screen.getByRole("switch", { name: "Debug frame" }));
		expect(screen.getByRole("switch", { name: "Always on top", checked: true })).toBeTruthy();
		expect(screen.getByRole("switch", { name: "Debug frame", checked: true })).toBeTruthy();
	});

	it("应用快照与快捷面板选择器分别使用字段名称，停用选项仍保持禁用", () => {
		render(
			<>
				<AppshotSettingsView
					labels={{
						title: "Appshot",
						sectionShortcut: "Shortcut",
						shortcutTitle: "Capture shortcut",
						shortcutDescription: "Trigger capture",
						sectionPermissions: "Permissions",
						permissionSectionDescription: "Access",
						permissions: {
							accessibilityTitle: "Accessibility",
							accessibilityDescription: "Control",
							screenTitle: "Screen",
							screenDescription: "Capture",
						},
						status: { granted: "Granted", denied: "Denied", unknown: "Unknown" },
						permissionHint: "Setup",
						setupPermissions: "Setup permissions",
					}}
					subtitle="Capture apps"
					gestureSection={{ id: "gesture" }}
					permissionsSection={{ id: "permissions" }}
					showKeyboardPreview={false}
					keyboardPreview={null}
					gestureValue="none"
					gestureOptions={[{ value: "none", label: "None" }]}
					onGestureChange={() => {}}
					accessibilityStatus="unknown"
					screenStatus="unknown"
					onOpenOnboarding={() => {}}
				/>
				<QuickPanelSettingsSectionView
					section={{ id: "quick-panel" }}
					triggerTitle="Panel shortcut"
					triggerDescription="Open panel"
					trigger="none"
					triggerOptions={[{ value: "none", label: "None" }]}
					onTriggerChange={() => {}}
					behaviorTitle="Panel behavior"
					behaviorDescription="After opening"
					behavior="toggle"
					behaviorOptions={[{ value: "toggle", label: "Toggle" }]}
					onBehaviorChange={() => {}}
					behaviorDisabled
				/>
			</>,
		);
		expect(screen.getByRole("button", { name: "Capture shortcut" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Panel shortcut" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Panel behavior" }).hasAttribute("disabled")).toBe(true);
	});

	it("远程输入开关按权限名称呈现并保持连接能力限制", async () => {
		Object.defineProperty(window, "vetta", {
			configurable: true,
			value: {
				remotePairing: { getState: async () => ({ status: "idle", inputEnabled: false, inputSupported: false }) },
			},
		});
		render(<RemotePairingSettings />);
		await waitFor(() =>
			expect(
				screen.getByRole("switch", { name: "remote.inputTitle", checked: false }).hasAttribute("disabled"),
			).toBe(true),
		);
	});
});
