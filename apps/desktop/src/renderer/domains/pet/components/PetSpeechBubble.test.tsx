// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PetSpeechBubble } from "./PetSpeechBubble";

const EXPECTED_VISUAL_INSET_PX = 40;
const EXPECTED_SURFACE_MAX_WIDTH_PX = 360;

vi.mock("../../../shared/components/pet/PetBubbleFrame", () => ({
	PetBubbleFrame: ({ children }: { children: string }) => <div>{children}</div>,
}));

describe("PetSpeechBubble", () => {
	it("renders the notice in document flow so the widget window can grow around it", () => {
		const { container } = render(
<PetSpeechBubble message={{ text: "正在处理任务" }} />,
		);
		const root = container.firstElementChild as HTMLElement | null;
		expect(screen.getByText("正在处理任务")).toBeTruthy();
		expect(root?.className).not.toContain("absolute");
		expect(root?.getAttribute("style") ?? "").not.toContain("50%");
	});

	it("reserves space around the bubble surface for its shadow", () => {
		const { container } = render(
<PetSpeechBubble message={{ text: "正在处理任务" }} />,
		);
		const root = container.firstElementChild as HTMLElement;

		expect(root.style.boxSizing).toBe("border-box");
		expect(root.style.padding).toBe(`${EXPECTED_VISUAL_INSET_PX}px`);
		expect(root.style.maxWidth).toBe(
			`${EXPECTED_SURFACE_MAX_WIDTH_PX + EXPECTED_VISUAL_INSET_PX * 2}px`,
		);
		expect(root.style.width).toBe("max-content");
	});

});
