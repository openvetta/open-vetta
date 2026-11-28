import { type WebContents, webContents } from "electron";
import { z } from "zod";
import { type BrowserCaptureApi, captureElementSchema, captureRectSchema } from "../../shared/browser-capture.js";

const pointSchema = z.object({ x: z.number().finite().nonnegative(), y: z.number().finite().nonnegative() });
const scrollSchema = z.object({
	x: z.number().finite().min(-12000).max(12000),
	y: z.number().finite().min(-12000).max(12000),
	point: pointSchema,
});
const inspectionSchema = z.object({
	url: z.string().max(8192),
	title: z.string().max(500),
	viewport: z.object({ width: z.number().positive().max(12000), height: z.number().positive().max(12000) }),
	elements: z.array(z.object({ rect: captureRectSchema, element: captureElementSchema })).max(64),
});

/** Runs only in an isolated guest world; no Node or host bridge is exposed to the page. */
function inspectPage(x: number, y: number) {
	let hit = document.elementFromPoint(x, y);
	while (hit?.shadowRoot) {
		const inner = hit.shadowRoot.elementFromPoint(x, y);
		if (!inner || inner === hit) break;
		hit = inner;
	}
	const interactive = hit?.closest("button,a[href],input,select,textarea,[role=button],[role=link]");
	let current = interactive ?? hit;
	const elements = [];
	while (current && elements.length < 64) {
		const bounds = current.getBoundingClientRect();
		const left = Math.max(0, bounds.left),
			top = Math.max(0, bounds.top);
		const width = Math.min(innerWidth, bounds.right) - left;
		const height = Math.min(innerHeight, bounds.bottom) - top;
		if (width > 0 && height > 0) {
			let text = "";
			if (!current.closest("input,textarea,select,[contenteditable]")) {
				const walker = document.createTreeWalker(current, NodeFilter.SHOW_TEXT);
				let node = walker.nextNode(),
					visited = 0;
				while (node && text.length < 500 && visited++ < 2000) {
					const parent = node.parentElement;
					if (
						parent &&
						!parent.closest("input,textarea,select,[contenteditable],script,style,[hidden],[aria-hidden=true]") &&
						parent.getClientRects().length > 0 &&
						getComputedStyle(parent).visibility !== "hidden"
					)
						text += ` ${node.textContent ?? ""}`;
					node = walker.nextNode();
				}
				text = text.replace(/\s+/g, " ").trim().slice(0, 500);
			}
			const testId = current.getAttribute("data-testid");
			const locator = current.id
				? `#${CSS.escape(current.id)}`
				: testId
					? `[data-testid=${JSON.stringify(testId)}]`
					: current.tagName.toLowerCase();
			elements.push({
				rect: { x: left, y: top, width, height },
				element: { tag: current.tagName.toLowerCase().slice(0, 80), text, locator: locator.slice(0, 300) },
			});
		}
		current = current.parentElement;
	}
	return {
		url: location.href.slice(0, 8192),
		title: document.title.slice(0, 500),
		viewport: { width: innerWidth, height: innerHeight },
		elements,
	};
}

export class BrowserCaptureService implements BrowserCaptureApi {
	constructor(
		private readonly owner: WebContents,
		private readonly resolve = webContents.fromId,
	) {}
	private guest(id: unknown): WebContents {
		if (typeof id !== "number" || !Number.isSafeInteger(id)) throw new Error("Invalid browser guest");
		const guest = this.resolve(id);
		if (!guest || guest.isDestroyed() || guest.hostWebContents !== this.owner || guest.getType() !== "webview")
			throw new Error("Untrusted browser guest");
		return guest;
	}
	async inspect(id: unknown, point: unknown) {
		const { x, y } = pointSchema.parse(point);
		const guest = this.guest(id);
		const result: unknown = await guest.executeJavaScriptInIsolatedWorld(999, [
			{ code: `(${inspectPage.toString()})(${x},${y})` },
		]);
		return inspectionSchema.parse(result);
	}
	async capture(id: unknown, expectedUrl: unknown) {
		const guest = this.guest(id);
		if (typeof expectedUrl !== "string" || guest.getURL() !== expectedUrl) throw new Error("Browser page changed");
		const image = await guest.capturePage();
		if (guest.isDestroyed() || guest.getURL() !== expectedUrl) throw new Error("Browser page changed");
		const size = image.getSize();
		if (image.isEmpty() || size.width > 12000 || size.height > 12000 || size.width * size.height > 64_000_000)
			throw new Error("Browser screenshot is too large or empty");
		return { data: image.toPNG().toString("base64"), ...size };
	}
	async scroll(id: unknown, delta: unknown) {
		const { x, y, point } = scrollSchema.parse(delta);
		const guest = this.guest(id);
		const zoom = guest.getZoomFactor();
		guest.sendInputEvent({
			type: "mouseWheel",
			x: Math.round(point.x * zoom),
			y: Math.round(point.y * zoom),
			deltaX: -x,
			deltaY: -y,
			canScroll: true,
		});
	}
}
