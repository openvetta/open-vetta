import type { MarkdownHost } from "@vetta-org/theme-ui/markdown";
import { vi } from "vitest";

export function createMarkdownHostFixture() {
	const close = vi.fn();
	/** What reached the clipboard, the save dialog and the image viewer, in order. */
	const copied: string[] = [];
	const saved: string[] = [];
	const opened: Array<[src: string, title: string | undefined]> = [];
	const host = {
		openHtml: vi.fn(async () => close),
		renderMermaid: vi.fn(
			async (_source: string, _theme: "light" | "dark") =>
				'<svg xmlns="http://www.w3.org/2000/svg"><text>Rendered</text></svg>',
		),
		favicon: vi.fn(async () => null),
		resolveImage: vi.fn(async (src: string) => src),
		copyImage: vi.fn(async (src: string) => {
			copied.push(src);
		}),
		saveImage: vi.fn(async (src: string) => {
			saved.push(src);
		}),
		openImage: vi.fn((src: string, title?: string) => {
			opened.push([src, title]);
		}),
	} satisfies MarkdownHost;
	return { host, close, copied, saved, opened };
}
