// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VettaKbd } from "./VettaKbd";

describe("VettaKbd", () => {
	it("renders one embossed keycap per key for the target platform", () => {
		const markup = renderToStaticMarkup(<VettaKbd keys="mod+shift+k" platform="mac" />);
		expect(markup.match(/<kbd/g)).toHaveLength(3);
		expect(markup).toContain("⌘");
		expect(markup).toContain("⇧");
		expect(markup).toContain("K");
		// 浮雕观感来自与应用快照键盘预览同源的键帽阴影。
		expect(markup).toContain("inset_0_1px_0_rgba(255,255,255,0.7)");
	});

	it("switches the same shortcut to Windows labels", () => {
		const markup = renderToStaticMarkup(<VettaKbd keys="mod+shift+k" platform="windows" />);
		expect(markup).toContain("Ctrl");
		expect(markup).toContain("Shift");
		expect(markup).not.toContain("⌘");
	});

	it("exposes a readable label instead of raw glyphs", () => {
		const markup = renderToStaticMarkup(<VettaKbd keys="mod+k" platform="mac" />);
		expect(markup).toContain('role="img"');
		expect(markup).toContain('aria-label="Command K"');
		expect(markup).toContain('aria-hidden="true"');
	});

	it("renders per-platform overrides and optional separators", () => {
		const markup = renderToStaticMarkup(
			<VettaKbd keys={["ctrl", { mac: "⌘", windows: "Win" }, "k"]} platform="windows" separator />,
		);
		expect(markup).toContain("Ctrl");
		expect(markup).toContain("Win");
		expect(markup.match(/>\+</g)).toHaveLength(2);
	});

	it("renders nothing when there is no shortcut", () => {
		expect(renderToStaticMarkup(<VettaKbd keys="" platform="mac" />)).toBe("");
	});
});
