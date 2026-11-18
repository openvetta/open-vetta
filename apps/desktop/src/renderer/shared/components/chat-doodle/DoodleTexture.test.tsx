// @vitest-environment jsdom
/**
 * 涂鸦当纹理用时的构图：与网格、涟漪一样向外淡出（而不是对话页那个上下渐隐），
 * 但不带环境光晕——两件事都容易被改回去，改回去就会在页面上看到明显差别。
 */
import { NEW_SESSION_TEXTURE_MASK } from "@vetta-org/theme-ui/chat/NewSessionBackground";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DoodleTexture } from "./DoodleTexture";

describe("DoodleTexture", () => {
	it("画一层细线图标，并按新会话页的规矩向外淡出", () => {
		const { container } = render(<DoodleTexture />);

		const svg = container.querySelector("svg");
		expect(svg).not.toBeNull();

		const layer = svg?.closest("[aria-hidden]") as HTMLElement;
		expect(layer.getAttribute("style")).toContain(NEW_SESSION_TEXTURE_MASK.split(",")[0]);
	});

	it("不叠环境光晕：那团光会和密集的纹路糊在一起", () => {
		const { container } = render(<DoodleTexture />);

		const glow = Array.from(container.querySelectorAll<HTMLElement>("div")).find((node) =>
			(node.getAttribute("style") ?? "").includes("var(--primary)"),
		);
		expect(glow).toBeUndefined();
	});
});
