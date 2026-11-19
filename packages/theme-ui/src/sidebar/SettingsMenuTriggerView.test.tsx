import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SettingsMenuTriggerView } from "./SettingsMenuTriggerView";

describe("SettingsMenuTriggerView", () => {
	it("renders one button of the sidebar button group with the settings glyph", () => {
		const markup = renderToStaticMarkup(
			<SettingsMenuTriggerView active={false} iconOnly settingsFallbackLabel="设置" />,
		);
		expect(markup).toContain('data-slot="button-group"');
		expect(markup).toContain('aria-label="设置"');
		expect(markup).toContain("icon-[solar--settings-minimalistic-linear]");
	});

	it("marks the item as pressed while the settings page is open", () => {
		const markup = renderToStaticMarkup(
			<SettingsMenuTriggerView active iconOnly settingsFallbackLabel="Settings" />,
		);
		expect(markup).toContain('aria-pressed="true"');
		expect(markup).toContain("data-active");
	});

	it("forwards the button ref so the sidebar can anchor the trigger", () => {
		const ref = createRef<HTMLButtonElement>();
		expect(() =>
			renderToStaticMarkup(<SettingsMenuTriggerView ref={ref} active={false} iconOnly settingsFallbackLabel="设置" />),
		).not.toThrow();
	});

	it("shows the claw state in the label and keeps a badge only while online", () => {
		const offline = renderToStaticMarkup(
			<SettingsMenuTriggerView active={false} iconOnly settingsFallbackLabel="设置" />,
		);
		const online = renderToStaticMarkup(
			<SettingsMenuTriggerView active={false} iconOnly settingsFallbackLabel="设置" clawOnline clawTitle="Claw 在线" />,
		);
		expect(offline).not.toContain("bg-primary");
		expect(online).toContain("设置 · Claw 在线");
		expect(online).toContain("bg-primary");
	});
});
